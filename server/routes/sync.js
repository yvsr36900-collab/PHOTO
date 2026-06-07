const router = require('express').Router();
const fs = require('fs');
const path = require('path');
const { getDb } = require('../db/schema');
const { authMiddleware } = require('../middleware/authMiddleware');
const { startWatcher, stopWatcher, getStatus, getPending, confirmUpload } = require('../sync/watcher');

function requireHost(req, res, session) {
  if (session.hostUserId !== req.user.id) {
    res.status(403).json({ success: false, error: 'Only the session host can manage photo sync' });
    return false;
  }
  return true;
}

// GET status
router.get('/:sessionId/status', authMiddleware, (req, res) => {
  const db = getDb();
  const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(req.params.sessionId);
  if (!session) return res.status(404).json({ success: false, error: 'Session not found' });
  if (!requireHost(req, res, session)) return;
  res.json({ success: true, data: getStatus(req.params.sessionId) });
});

// POST start
router.post('/:sessionId/start', authMiddleware, (req, res) => {
  const db = getDb();
  const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(req.params.sessionId);
  if (!session) return res.status(404).json({ success: false, error: 'Session not found' });
  if (!requireHost(req, res, session)) return;

  if (new Date(session.expiresAt) <= new Date())
    return res.status(410).json({ success: false, error: 'Session has expired' });

  const { watchPath } = req.body;
  if (watchPath && /\.photoslibrary/i.test(watchPath))
    return res.status(400).json({ success: false, error: 'The Photos Library bundle cannot be watched directly (macOS permission restriction). Export photos to Downloads or Desktop instead.' });

  const user = db.prepare('SELECT displayName FROM users WHERE id = ?').get(req.user.id);
  const state = startWatcher(req.params.sessionId, watchPath || null, user?.displayName || 'Sync');

  res.json({ success: true, data: { watchPath: state.watchPath, message: 'Photo sync started' } });
});

// POST stop
router.post('/:sessionId/stop', authMiddleware, (req, res) => {
  const db = getDb();
  const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(req.params.sessionId);
  if (!session) return res.status(404).json({ success: false, error: 'Session not found' });
  if (!requireHost(req, res, session)) return;

  stopWatcher(req.params.sessionId);
  res.json({ success: true, data: { message: 'Photo sync stopped' } });
});

// GET pending list (host only)
router.get('/:sessionId/pending', authMiddleware, (req, res) => {
  const db = getDb();
  const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(req.params.sessionId);
  if (!session) return res.status(404).json({ success: false, error: 'Session not found' });
  if (!requireHost(req, res, session)) return;
  res.json({ success: true, data: getPending(req.params.sessionId) });
});

// GET pending image thumbnail — UUID filenames are sufficient security; no auth header on <img> possible
router.get('/:sessionId/pending/:filename', (req, res) => {
  const base = path.join(__dirname, '..', 'pending', req.params.sessionId);
  const filePath = path.join(base, req.params.filename);
  // Prevent path traversal
  if (!filePath.startsWith(base + path.sep) && filePath !== base) {
    return res.status(400).end();
  }
  if (!fs.existsSync(filePath)) return res.status(404).end();
  res.sendFile(filePath);
});

// POST confirm — uploads selected pending files, discards the rest
router.post('/:sessionId/confirm', authMiddleware, (req, res) => {
  const db = getDb();
  const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(req.params.sessionId);
  if (!session) return res.status(404).json({ success: false, error: 'Session not found' });
  if (!requireHost(req, res, session)) return;

  const { selected } = req.body;
  if (!Array.isArray(selected)) return res.status(400).json({ success: false, error: 'selected must be an array of filenames' });

  const result = confirmUpload(req.params.sessionId, selected);
  res.json({ success: true, data: result });
});

module.exports = router;
