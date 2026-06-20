const router = require('express').Router();
const { v4: uuidv4 } = require('uuid');
const QRCode = require('qrcode');
const { getDb } = require('../db/schema');
const { authMiddleware, optionalAuth } = require('../middleware/authMiddleware');
const { enforceSessionLimit, getLimits, requireFeature } = require('../middleware/planEnforcer');

function generateJoinCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

// Single source of truth for session status + time remaining
function computeStatus(session) {
  const now = new Date();
  const expires = new Date(session.expiresAt);

  if (session.status === 'stopped') {
    // Time remaining was frozen at the moment it was stopped
    const frozenRemaining = Math.max(0, Math.floor((expires - new Date(session.stoppedAt)) / 1000));
    return { status: 'stopped', secondsLeft: frozenRemaining };
  }
  if (expires <= now) {
    return { status: 'expired', secondsLeft: 0 };
  }
  return { status: 'active', secondsLeft: Math.floor((expires - now) / 1000) };
}

// Create session
router.post('/', authMiddleware, enforceSessionLimit, (req, res) => {
  const { name, occasionType, durationMinutes, guestListEnabled } = req.body;
  if (!name || !occasionType || !durationMinutes)
    return res.status(400).json({ success: false, error: 'name, occasionType, durationMinutes required' });

  const db = getDb();

  if (guestListEnabled) {
    const userRecord = db.prepare('SELECT plan FROM users WHERE id = ?').get(req.user.id);
    const limits = getLimits(userRecord?.plan);
    if (!limits.guestList)
      return res.status(403).json({ success: false, error: 'Guest list requires Standard plan or above' });
  }

  let joinCode;
  do { joinCode = generateJoinCode(); } while (db.prepare('SELECT id FROM sessions WHERE joinCode = ?').get(joinCode));

  const expiresAt = new Date(Date.now() + durationMinutes * 60000).toISOString();
  const result = db.prepare(
    'INSERT INTO sessions (joinCode, name, occasionType, hostUserId, durationMinutes, expiresAt, guestListEnabled) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(joinCode, name, occasionType, req.user.id, durationMinutes, expiresAt, guestListEnabled ? 1 : 0);

  const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json({ success: true, data: { ...session, ...computeStatus(session) } });
});

// List my sessions
router.get('/', authMiddleware, (req, res) => {
  const db = getDb();
  const sessions = db.prepare('SELECT * FROM sessions WHERE hostUserId = ? ORDER BY createdAt DESC').all(req.user.id);
  res.json({ success: true, data: sessions.map((s) => ({ ...s, ...computeStatus(s) })) });
});

// Get session by join code
router.get('/code/:joinCode', optionalAuth, (req, res) => {
  const db = getDb();
  const session = db.prepare('SELECT * FROM sessions WHERE joinCode = ?').get(req.params.joinCode.toUpperCase());
  if (!session) return res.status(404).json({ success: false, error: 'Session not found' });
  res.json({ success: true, data: { ...session, ...computeStatus(session) } });
});

// Get session by ID
router.get('/:id', optionalAuth, (req, res) => {
  const db = getDb();
  const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(req.params.id);
  if (!session) return res.status(404).json({ success: false, error: 'Session not found' });
  res.json({ success: true, data: { ...session, ...computeStatus(session) } });
});

// Join session
router.post('/join', optionalAuth, (req, res) => {
  const { joinCode, displayName } = req.body;
  if (!joinCode) return res.status(400).json({ success: false, error: 'joinCode required' });

  const db = getDb();
  const session = db.prepare('SELECT * FROM sessions WHERE joinCode = ?').get(joinCode.toUpperCase());
  if (!session) return res.status(404).json({ success: false, error: 'Session not found' });

  const { status } = computeStatus(session);
  if (status === 'expired')
    return res.status(410).json({ success: false, error: 'Session has expired' });

  const isHost = req.user && req.user.id === session.hostUserId;
  if (session.guestListEnabled && !isHost) {
    const joinName = req.user ? req.user.displayName : (displayName || '');
    const allowed = db.prepare(
      'SELECT id FROM session_allowlist WHERE sessionId = ? AND LOWER(name) = LOWER(?)'
    ).get(session.id, joinName.trim());
    if (!allowed)
      return res.status(403).json({ success: false, error: 'You are not on the guest list for this session' });
  }

  const userId = req.user ? String(req.user.id) : `guest_${uuidv4()}`;
  const name = req.user ? req.user.displayName : (displayName || `Guest_${userId.slice(-4)}`);

  const existing = db.prepare('SELECT id FROM session_members WHERE sessionId = ? AND userId = ?').get(session.id, userId);
  if (!existing) {
    db.prepare('INSERT INTO session_members (sessionId, userId, displayName) VALUES (?, ?, ?)').run(session.id, userId, name);
  }

  res.json({ success: true, data: { session: { ...session, ...computeStatus(session) }, userId, displayName: name } });
});

// Stop session (host only)
router.post('/:id/stop', authMiddleware, (req, res) => {
  const db = getDb();
  const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(req.params.id);
  if (!session) return res.status(404).json({ success: false, error: 'Session not found' });
  if (session.hostUserId !== req.user.id)
    return res.status(403).json({ success: false, error: 'Only the host can stop the session' });

  const { status } = computeStatus(session);
  if (status === 'expired')
    return res.status(410).json({ success: false, error: 'Session has already expired' });
  if (status === 'stopped')
    return res.status(400).json({ success: false, error: 'Session is already stopped' });

  const stoppedAt = new Date().toISOString();
  db.prepare("UPDATE sessions SET status = 'stopped', stoppedAt = ? WHERE id = ?").run(stoppedAt, session.id);

  const updated = db.prepare('SELECT * FROM sessions WHERE id = ?').get(session.id);
  res.json({ success: true, data: { ...updated, ...computeStatus(updated) } });
});

// Restart session (host only) — resumes using the frozen remaining time
router.post('/:id/restart', authMiddleware, (req, res) => {
  const db = getDb();
  const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(req.params.id);
  if (!session) return res.status(404).json({ success: false, error: 'Session not found' });
  if (session.hostUserId !== req.user.id)
    return res.status(403).json({ success: false, error: 'Only the host can restart the session' });

  if (session.status !== 'stopped')
    return res.status(400).json({ success: false, error: 'Session is not stopped' });

  // Remaining time was frozen between stoppedAt and the original expiresAt
  const remaining = new Date(session.expiresAt) - new Date(session.stoppedAt);
  if (remaining <= 0)
    return res.status(410).json({ success: false, error: 'No time remaining — add more time before restarting' });

  const newExpiresAt = new Date(Date.now() + remaining).toISOString();
  db.prepare("UPDATE sessions SET status = 'active', stoppedAt = NULL, expiresAt = ? WHERE id = ?")
    .run(newExpiresAt, session.id);

  const updated = db.prepare('SELECT * FROM sessions WHERE id = ?').get(session.id);
  res.json({ success: true, data: { ...updated, ...computeStatus(updated) } });
});

// Add time (host only) — also works on stopped sessions
router.post('/:id/add-time', authMiddleware, (req, res) => {
  const { minutes } = req.body;
  if (![15, 30, 60].includes(Number(minutes)))
    return res.status(400).json({ success: false, error: 'minutes must be 15, 30, or 60' });

  const db = getDb();
  const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(req.params.id);
  if (!session) return res.status(404).json({ success: false, error: 'Session not found' });
  if (session.hostUserId !== req.user.id)
    return res.status(403).json({ success: false, error: 'Only the host can add time' });

  const newExpiry = new Date(new Date(session.expiresAt).getTime() + minutes * 60000).toISOString();
  db.prepare('UPDATE sessions SET expiresAt = ?, durationMinutes = durationMinutes + ? WHERE id = ?')
    .run(newExpiry, minutes, session.id);

  const updated = db.prepare('SELECT * FROM sessions WHERE id = ?').get(session.id);
  res.json({ success: true, data: { ...updated, ...computeStatus(updated) } });
});

// Generate QR code
router.get('/:id/qr', authMiddleware, requireFeature('qrCode'), async (req, res) => {
  const db = getDb();
  const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(req.params.id);
  if (!session) return res.status(404).json({ success: false, error: 'Session not found' });

  const joinUrl = `${req.headers.origin || 'http://localhost:5173'}/join/${session.joinCode}`;
  const qrDataUrl = await QRCode.toDataURL(joinUrl);
  res.json({ success: true, data: { qrDataUrl, joinUrl } });
});

// Get session members (with online status)
router.get('/:id/members', optionalAuth, (req, res) => {
  const db = getDb();
  const session = db.prepare('SELECT s.id, s.hostUserId, u.displayName as hostName FROM sessions s JOIN users u ON s.hostUserId = u.id WHERE s.id = ?').get(req.params.id);
  if (!session) return res.status(404).json({ success: false, error: 'Session not found' });

  const members = db.prepare('SELECT * FROM session_members WHERE sessionId = ? ORDER BY joinedAt ASC').all(req.params.id);
  const now = Date.now();
  const withStatus = members.map((m) => ({
    ...m,
    isOnline: m.lastSeenAt ? now - new Date(m.lastSeenAt).getTime() < 30000 : false,
  }));
  res.json({ success: true, data: { members: withStatus, hostName: session.hostName, hostUserId: session.hostUserId } });
});

// Heartbeat — any session member (auth or guest) updates lastSeenAt
router.post('/:id/heartbeat', optionalAuth, (req, res) => {
  const db = getDb();
  const session = db.prepare('SELECT id FROM sessions WHERE id = ?').get(req.params.id);
  if (!session) return res.status(404).json({ success: false, error: 'Session not found' });

  const userId = req.user ? String(req.user.id) : (req.body.guestId || null);
  if (!userId) return res.status(400).json({ success: false, error: 'guestId required for unauthenticated users' });

  db.prepare('UPDATE session_members SET lastSeenAt = ? WHERE sessionId = ? AND userId = ?')
    .run(new Date().toISOString(), session.id, userId);

  res.json({ success: true });
});

// Get guest allowlist (host only)
router.get('/:id/allowlist', authMiddleware, (req, res) => {
  const db = getDb();
  const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(req.params.id);
  if (!session) return res.status(404).json({ success: false, error: 'Session not found' });
  if (session.hostUserId !== req.user.id)
    return res.status(403).json({ success: false, error: 'Only the host can view the guest list' });

  const entries = db.prepare('SELECT * FROM session_allowlist WHERE sessionId = ? ORDER BY addedAt ASC').all(req.params.id);
  res.json({ success: true, data: entries });
});

// Add name to guest allowlist (host only, requires guestList feature)
router.post('/:id/allowlist', authMiddleware, requireFeature('guestList'), (req, res) => {
  const { name } = req.body;
  if (!name?.trim()) return res.status(400).json({ success: false, error: 'name required' });

  const db = getDb();
  const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(req.params.id);
  if (!session) return res.status(404).json({ success: false, error: 'Session not found' });
  if (session.hostUserId !== req.user.id)
    return res.status(403).json({ success: false, error: 'Only the host can manage the guest list' });

  const duplicate = db.prepare(
    'SELECT id FROM session_allowlist WHERE sessionId = ? AND LOWER(name) = LOWER(?)'
  ).get(session.id, name.trim());
  if (duplicate) return res.status(409).json({ success: false, error: 'Name already on the list' });

  db.prepare('INSERT INTO session_allowlist (sessionId, name) VALUES (?, ?)').run(session.id, name.trim());
  const entries = db.prepare('SELECT * FROM session_allowlist WHERE sessionId = ? ORDER BY addedAt ASC').all(session.id);
  res.status(201).json({ success: true, data: entries });
});

// Remove name from guest allowlist (host only)
router.delete('/:id/allowlist/:entryId', authMiddleware, (req, res) => {
  const db = getDb();
  const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(req.params.id);
  if (!session) return res.status(404).json({ success: false, error: 'Session not found' });
  if (session.hostUserId !== req.user.id)
    return res.status(403).json({ success: false, error: 'Only the host can manage the guest list' });

  db.prepare('DELETE FROM session_allowlist WHERE id = ? AND sessionId = ?').run(req.params.entryId, session.id);
  res.json({ success: true });
});

module.exports = router;
