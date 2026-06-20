const { supabase } = require('../db/supabase');

const PLAN_LIMITS = {
  free:     { maxPhotos: 10,       maxSessions: 1,        qrCode: false, rsvp: false, poster: false, driveExport: false, guestList: false },
  standard: { maxPhotos: 200,      maxSessions: 5,        qrCode: true,  rsvp: false, poster: false, driveExport: false, guestList: true  },
  premium:  { maxPhotos: Infinity, maxSessions: Infinity, qrCode: true,  rsvp: true,  poster: true,  driveExport: true,  guestList: true  },
};

function getLimits(plan) {
  return PLAN_LIMITS[plan] || PLAN_LIMITS.free;
}

function requireFeature(feature) {
  return async (req, res, next) => {
    try {
      const { data: user } = await supabase
        .from('users').select('plan').eq('id', req.user.id).single();
      if (!user) return res.status(404).json({ success: false, error: 'User not found' });

      const limits = getLimits(user.plan);
      if (!limits[feature])
        return res.status(403).json({ success: false, error: `Feature "${feature}" requires a higher plan` });
      next();
    } catch (err) { next(err); }
  };
}

async function enforcePhotoLimit(req, res, next) {
  try {
    const sessionId = req.params.sessionId || req.body.sessionId;

    // Look up the session host to get the plan — fixes the guest-upload bug
    const { data: session } = await supabase
      .from('sessions').select('host_user_id').eq('id', sessionId).single();
    if (!session) return res.status(404).json({ success: false, error: 'Session not found' });

    const { data: host } = await supabase
      .from('users').select('plan').eq('id', session.host_user_id).single();

    const limits = getLimits(host?.plan || 'free');
    if (limits.maxPhotos === Infinity) return next();

    const { count } = await supabase
      .from('photos').select('*', { count: 'exact', head: true }).eq('session_id', sessionId);

    if (count >= limits.maxPhotos) {
      return res.status(403).json({
        success: false,
        error: `Photo limit reached for this event (${limits.maxPhotos} photos). Host needs to upgrade their plan.`,
      });
    }
    next();
  } catch (err) { next(err); }
}

async function enforceSessionLimit(req, res, next) {
  try {
    const { data: user } = await supabase
      .from('users').select('plan').eq('id', req.user.id).single();
    if (!user) return res.status(404).json({ success: false, error: 'User not found' });

    const limits = getLimits(user.plan);
    if (limits.maxSessions === Infinity) return next();

    const { count } = await supabase
      .from('sessions').select('*', { count: 'exact', head: true })
      .eq('host_user_id', req.user.id)
      .gt('expires_at', new Date().toISOString());

    if (count >= limits.maxSessions) {
      return res.status(403).json({
        success: false,
        error: `Active session limit reached for your plan (${limits.maxSessions}). Please upgrade or let a session expire.`,
      });
    }
    next();
  } catch (err) { next(err); }
}

module.exports = { getLimits, requireFeature, enforcePhotoLimit, enforceSessionLimit, PLAN_LIMITS };
