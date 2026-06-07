const { getDb } = require('../db/schema');

const PLAN_LIMITS = {
  free:     { maxPhotos: 10,        maxSessions: 1,        qrCode: false, rsvp: false, poster: false, driveExport: false },
  standard: { maxPhotos: 200,       maxSessions: 5,        qrCode: true,  rsvp: false, poster: false, driveExport: false },
  premium:  { maxPhotos: Infinity,  maxSessions: Infinity, qrCode: true,  rsvp: true,  poster: true,  driveExport: true  },
};

function getLimits(plan) {
  return PLAN_LIMITS[plan] || PLAN_LIMITS.free;
}

function requireFeature(feature) {
  return (req, res, next) => {
    const db = getDb();
    const user = db.prepare('SELECT plan FROM users WHERE id = ?').get(req.user.id);
    if (!user) return res.status(404).json({ success: false, error: 'User not found' });

    const limits = getLimits(user.plan);
    if (!limits[feature]) {
      return res.status(403).json({ success: false, error: `Feature "${feature}" requires a higher plan` });
    }
    next();
  };
}

function enforcePhotoLimit(req, res, next) {
  const db = getDb();
  const user = db.prepare('SELECT plan FROM users WHERE id = ?').get(req.user.id);
  if (!user) return res.status(404).json({ success: false, error: 'User not found' });

  const sessionId = req.params.sessionId || req.body.sessionId;
  const limits = getLimits(user.plan);

  const count = db.prepare('SELECT COUNT(*) as cnt FROM photos WHERE sessionId = ?').get(sessionId);
  if (count.cnt >= limits.maxPhotos) {
    return res.status(403).json({
      success: false,
      error: `Photo limit reached for your plan (${limits.maxPhotos} photos). Please upgrade.`,
    });
  }
  next();
}

function enforceSessionLimit(req, res, next) {
  const db = getDb();
  const user = db.prepare('SELECT plan FROM users WHERE id = ?').get(req.user.id);
  if (!user) return res.status(404).json({ success: false, error: 'User not found' });

  const limits = getLimits(user.plan);
  if (limits.maxSessions === Infinity) return next();

  const count = db.prepare(
    "SELECT COUNT(*) as cnt FROM sessions WHERE hostUserId = ? AND expiresAt > datetime('now')"
  ).get(req.user.id);

  if (count.cnt >= limits.maxSessions) {
    return res.status(403).json({
      success: false,
      error: `Active session limit reached for your plan (${limits.maxSessions}). Please upgrade or close a session.`,
    });
  }
  next();
}

module.exports = { getLimits, requireFeature, enforcePhotoLimit, enforceSessionLimit, PLAN_LIMITS };
