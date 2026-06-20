const router = require('express').Router();
const { supabase, mapRsvp } = require('../db/supabase');
const { authMiddleware } = require('../middleware/authMiddleware');
const { requireFeature } = require('../middleware/planEnforcer');

// Submit RSVP (public — no auth needed)
router.post('/:joinCode', async (req, res, next) => {
  try {
    const { guestName, status } = req.body;
    if (!guestName || !status)
      return res.status(400).json({ success: false, error: 'guestName and status required' });
    if (!['attending', 'not_attending'].includes(status))
      return res.status(400).json({ success: false, error: 'status must be attending or not_attending' });

    const { data: session } = await supabase
      .from('sessions').select('id, host_user_id').eq('join_code', req.params.joinCode.toUpperCase()).maybeSingle();
    if (!session) return res.status(404).json({ success: false, error: 'Session not found' });

    const { data: host } = await supabase.from('users').select('plan').eq('id', session.host_user_id).single();
    if (!host || host.plan !== 'premium')
      return res.status(403).json({ success: false, error: 'RSVP is only available on Premium plan sessions' });

    await supabase.from('rsvps').insert({ session_id: session.id, guest_name: guestName, status });
    res.status(201).json({ success: true, data: { message: 'RSVP recorded', guestName, status } });
  } catch (err) { next(err); }
});

// Get RSVP list for a session (host only)
router.get('/:sessionId', authMiddleware, requireFeature('rsvp'), async (req, res, next) => {
  try {
    const { data: session } = await supabase
      .from('sessions').select('host_user_id').eq('id', req.params.sessionId).single();
    if (!session) return res.status(404).json({ success: false, error: 'Session not found' });
    if (session.host_user_id !== req.user.id)
      return res.status(403).json({ success: false, error: 'Only the host can view RSVPs' });

    const { data: rows } = await supabase
      .from('rsvps').select('*').eq('session_id', req.params.sessionId).order('created_at', { ascending: true });

    const rsvps = (rows || []).map(mapRsvp);
    const attending = rsvps.filter((r) => r.status === 'attending').length;
    const notAttending = rsvps.filter((r) => r.status === 'not_attending').length;

    res.json({ success: true, data: { rsvps, summary: { attending, notAttending, total: rsvps.length } } });
  } catch (err) { next(err); }
});

module.exports = router;
