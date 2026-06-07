const router = require('express').Router();
const { getDb } = require('../db/schema');
const { authMiddleware, optionalAuth } = require('../middleware/authMiddleware');
const { requireFeature } = require('../middleware/planEnforcer');

// Submit RSVP (public — no auth needed)
router.post('/:joinCode', (req, res) => {
  const { guestName, status } = req.body;
  if (!guestName || !status)
    return res.status(400).json({ success: false, error: 'guestName and status required' });
  if (!['attending', 'not_attending'].includes(status))
    return res.status(400).json({ success: false, error: 'status must be attending or not_attending' });

  const db = getDb();
  const session = db.prepare('SELECT * FROM sessions WHERE joinCode = ?').get(req.params.joinCode.toUpperCase());
  if (!session) return res.status(404).json({ success: false, error: 'Session not found' });

  // Check that session host has RSVP feature (premium)
  const host = db.prepare('SELECT plan FROM users WHERE id = ?').get(session.hostUserId);
  if (!host || host.plan !== 'premium')
    return res.status(403).json({ success: false, error: 'RSVP is only available on Premium plan sessions' });

  db.prepare('INSERT INTO rsvps (sessionId, guestName, status) VALUES (?, ?, ?)').run(session.id, guestName, status);

  res.status(201).json({ success: true, data: { message: 'RSVP recorded', guestName, status } });
});

// Get RSVP list for a session (host only)
router.get('/:sessionId', authMiddleware, requireFeature('rsvp'), (req, res) => {
  const db = getDb();
  const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(req.params.sessionId);
  if (!session) return res.status(404).json({ success: false, error: 'Session not found' });
  if (session.hostUserId !== req.user.id)
    return res.status(403).json({ success: false, error: 'Only the host can view RSVPs' });

  const rsvps = db.prepare('SELECT * FROM rsvps WHERE sessionId = ? ORDER BY createdAt ASC').all(req.params.sessionId);
  const attending = rsvps.filter((r) => r.status === 'attending').length;
  const notAttending = rsvps.filter((r) => r.status === 'not_attending').length;

  res.json({ success: true, data: { rsvps, summary: { attending, notAttending, total: rsvps.length } } });
});

module.exports = router;
