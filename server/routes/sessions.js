const router = require('express').Router();
const { v4: uuidv4 } = require('uuid');
const QRCode = require('qrcode');
const { supabase, mapSession, mapMember, mapAllowlistEntry } = require('../db/supabase');
const { authMiddleware, optionalAuth } = require('../middleware/authMiddleware');
const { enforceSessionLimit, getLimits, requireFeature } = require('../middleware/planEnforcer');

function generateJoinCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

// Single source of truth for session status + time remaining
// Receives camelCase session object (post-mapSession)
function computeStatus(session) {
  const now = new Date();
  const expires = new Date(session.expiresAt);

  if (session.status === 'stopped') {
    const frozenRemaining = Math.max(0, Math.floor((expires - new Date(session.stoppedAt)) / 1000));
    return { status: 'stopped', secondsLeft: frozenRemaining };
  }
  if (expires <= now) {
    return { status: 'expired', secondsLeft: 0 };
  }
  return { status: 'active', secondsLeft: Math.floor((expires - now) / 1000) };
}

async function fetchSession(id) {
  const { data } = await supabase.from('sessions').select('*').eq('id', id).single();
  return data ? mapSession(data) : null;
}

async function fetchSessionByCode(joinCode) {
  const { data } = await supabase.from('sessions').select('*').eq('join_code', joinCode.toUpperCase()).maybeSingle();
  return data ? mapSession(data) : null;
}

// Create session
router.post('/', authMiddleware, enforceSessionLimit, async (req, res, next) => {
  try {
    const { name, occasionType, durationMinutes, guestListEnabled } = req.body;
    if (!name || !occasionType || !durationMinutes)
      return res.status(400).json({ success: false, error: 'name, occasionType, durationMinutes required' });

    if (guestListEnabled) {
      const { data: userRecord } = await supabase.from('users').select('plan').eq('id', req.user.id).single();
      const limits = getLimits(userRecord?.plan);
      if (!limits.guestList)
        return res.status(403).json({ success: false, error: 'Guest list requires Standard plan or above' });
    }

    // Generate unique join code
    let joinCode;
    do {
      joinCode = generateJoinCode();
      const { data: existing } = await supabase.from('sessions').select('id').eq('join_code', joinCode).maybeSingle();
      if (!existing) break;
    } while (true);

    const expiresAt = new Date(Date.now() + Number(durationMinutes) * 60000).toISOString();
    const { data: raw, error } = await supabase
      .from('sessions')
      .insert({
        join_code: joinCode,
        name,
        occasion_type: occasionType,
        host_user_id: req.user.id,
        duration_minutes: Number(durationMinutes),
        expires_at: expiresAt,
        guest_list_enabled: !!guestListEnabled,
      })
      .select().single();

    if (error) throw error;
    const session = mapSession(raw);
    res.status(201).json({ success: true, data: { ...session, ...computeStatus(session) } });
  } catch (err) { next(err); }
});

// List my sessions
router.get('/', authMiddleware, async (req, res, next) => {
  try {
    const { data: rows } = await supabase
      .from('sessions').select('*').eq('host_user_id', req.user.id).order('created_at', { ascending: false });
    const sessions = (rows || []).map((r) => { const s = mapSession(r); return { ...s, ...computeStatus(s) }; });
    res.json({ success: true, data: sessions });
  } catch (err) { next(err); }
});

// Get session by join code
router.get('/code/:joinCode', optionalAuth, async (req, res, next) => {
  try {
    const session = await fetchSessionByCode(req.params.joinCode);
    if (!session) return res.status(404).json({ success: false, error: 'Session not found' });
    res.json({ success: true, data: { ...session, ...computeStatus(session) } });
  } catch (err) { next(err); }
});

// Get session by ID
router.get('/:id', optionalAuth, async (req, res, next) => {
  try {
    const session = await fetchSession(req.params.id);
    if (!session) return res.status(404).json({ success: false, error: 'Session not found' });
    res.json({ success: true, data: { ...session, ...computeStatus(session) } });
  } catch (err) { next(err); }
});

// Join session
router.post('/join', optionalAuth, async (req, res, next) => {
  try {
    const { joinCode, displayName } = req.body;
    if (!joinCode) return res.status(400).json({ success: false, error: 'joinCode required' });

    const session = await fetchSessionByCode(joinCode);
    if (!session) return res.status(404).json({ success: false, error: 'Session not found' });

    const { status } = computeStatus(session);
    if (status === 'expired')
      return res.status(410).json({ success: false, error: 'Session has expired' });

    const isHost = req.user && req.user.id === session.hostUserId;
    if (session.guestListEnabled && !isHost) {
      const joinName = req.user ? req.user.displayName : (displayName || '');
      const { data: allowed } = await supabase
        .from('session_allowlist')
        .select('id')
        .eq('session_id', session.id)
        .ilike('name', joinName.trim())
        .maybeSingle();
      if (!allowed)
        return res.status(403).json({ success: false, error: 'You are not on the guest list for this session' });
    }

    const userId = req.user ? String(req.user.id) : `guest_${uuidv4()}`;
    const name = req.user ? req.user.displayName : (displayName || `Guest_${userId.slice(-4)}`);

    const { data: existing } = await supabase
      .from('session_members').select('id').eq('session_id', session.id).eq('user_id', userId).maybeSingle();
    if (!existing) {
      await supabase.from('session_members').insert({ session_id: session.id, user_id: userId, display_name: name });
    }

    res.json({ success: true, data: { session: { ...session, ...computeStatus(session) }, userId, displayName: name } });
  } catch (err) { next(err); }
});

// Stop session (host only)
router.post('/:id/stop', authMiddleware, async (req, res, next) => {
  try {
    const session = await fetchSession(req.params.id);
    if (!session) return res.status(404).json({ success: false, error: 'Session not found' });
    if (session.hostUserId !== req.user.id)
      return res.status(403).json({ success: false, error: 'Only the host can stop the session' });

    const { status } = computeStatus(session);
    if (status === 'expired') return res.status(410).json({ success: false, error: 'Session has already expired' });
    if (status === 'stopped') return res.status(400).json({ success: false, error: 'Session is already stopped' });

    const stoppedAt = new Date().toISOString();
    await supabase.from('sessions').update({ status: 'stopped', stopped_at: stoppedAt }).eq('id', session.id);

    const updated = await fetchSession(session.id);
    res.json({ success: true, data: { ...updated, ...computeStatus(updated) } });
  } catch (err) { next(err); }
});

// Restart session (host only)
router.post('/:id/restart', authMiddleware, async (req, res, next) => {
  try {
    const session = await fetchSession(req.params.id);
    if (!session) return res.status(404).json({ success: false, error: 'Session not found' });
    if (session.hostUserId !== req.user.id)
      return res.status(403).json({ success: false, error: 'Only the host can restart the session' });
    if (session.status !== 'stopped')
      return res.status(400).json({ success: false, error: 'Session is not stopped' });

    const remaining = new Date(session.expiresAt) - new Date(session.stoppedAt);
    if (remaining <= 0)
      return res.status(410).json({ success: false, error: 'No time remaining — add more time before restarting' });

    const newExpiresAt = new Date(Date.now() + remaining).toISOString();
    await supabase.from('sessions').update({ status: 'active', stopped_at: null, expires_at: newExpiresAt }).eq('id', session.id);

    const updated = await fetchSession(session.id);
    res.json({ success: true, data: { ...updated, ...computeStatus(updated) } });
  } catch (err) { next(err); }
});

// Add time (host only)
router.post('/:id/add-time', authMiddleware, async (req, res, next) => {
  try {
    const { minutes } = req.body;
    if (![15, 30, 60].includes(Number(minutes)))
      return res.status(400).json({ success: false, error: 'minutes must be 15, 30, or 60' });

    const session = await fetchSession(req.params.id);
    if (!session) return res.status(404).json({ success: false, error: 'Session not found' });
    if (session.hostUserId !== req.user.id)
      return res.status(403).json({ success: false, error: 'Only the host can add time' });

    const newExpiresAt = new Date(new Date(session.expiresAt).getTime() + Number(minutes) * 60000).toISOString();
    await supabase.from('sessions').update({
      expires_at: newExpiresAt,
      duration_minutes: session.durationMinutes + Number(minutes),
    }).eq('id', session.id);

    const updated = await fetchSession(session.id);
    res.json({ success: true, data: { ...updated, ...computeStatus(updated) } });
  } catch (err) { next(err); }
});

// Generate QR code
router.get('/:id/qr', authMiddleware, requireFeature('qrCode'), async (req, res, next) => {
  try {
    const session = await fetchSession(req.params.id);
    if (!session) return res.status(404).json({ success: false, error: 'Session not found' });

    const joinUrl = `${req.headers.origin || 'http://localhost:5173'}/join/${session.joinCode}`;
    const qrDataUrl = await QRCode.toDataURL(joinUrl);
    res.json({ success: true, data: { qrDataUrl, joinUrl } });
  } catch (err) { next(err); }
});

// Get session members (with online status)
router.get('/:id/members', optionalAuth, async (req, res, next) => {
  try {
    const { data: sessionRaw } = await supabase
      .from('sessions')
      .select('id, host_user_id, users!sessions_host_user_id_fkey(display_name)')
      .eq('id', req.params.id)
      .single();
    if (!sessionRaw) return res.status(404).json({ success: false, error: 'Session not found' });

    const hostName = sessionRaw.users?.display_name || 'Host';
    const { data: rows } = await supabase
      .from('session_members').select('*').eq('session_id', req.params.id).order('joined_at', { ascending: true });

    const now = Date.now();
    const members = (rows || []).map((m) => ({
      ...mapMember(m),
      isOnline: m.last_seen_at ? now - new Date(m.last_seen_at).getTime() < 30000 : false,
    }));

    res.json({ success: true, data: { members, hostName, hostUserId: sessionRaw.host_user_id } });
  } catch (err) { next(err); }
});

// Kick member (host only)
router.delete('/:id/members/:userId', authMiddleware, async (req, res, next) => {
  try {
    const session = await fetchSession(req.params.id);
    if (!session) return res.status(404).json({ success: false, error: 'Session not found' });
    if (session.hostUserId !== req.user.id)
      return res.status(403).json({ success: false, error: 'Only the host can remove members' });
    if (String(req.params.userId) === String(req.user.id))
      return res.status(400).json({ success: false, error: 'You cannot kick yourself' });

    await supabase.from('session_members')
      .delete()
      .eq('session_id', session.id)
      .eq('user_id', req.params.userId);

    res.json({ success: true, data: { kicked: true } });
  } catch (err) { next(err); }
});

// Heartbeat
router.post('/:id/heartbeat', optionalAuth, async (req, res, next) => {
  try {
    const { data: session } = await supabase
      .from('sessions')
      .select('id, host_user_id, users!sessions_host_user_id_fkey(display_name)')
      .eq('id', req.params.id)
      .maybeSingle();
    if (!session) return res.status(404).json({ success: false, error: 'Session not found' });

    const userId = req.user ? String(req.user.id) : (req.body.guestId || null);
    if (!userId) return res.status(400).json({ success: false, error: 'guestId required for unauthenticated users' });

    // Check if this user is still a member (they may have been kicked)
    const { data: member } = await supabase
      .from('session_members')
      .select('id')
      .eq('session_id', req.params.id)
      .eq('user_id', userId)
      .maybeSingle();

    if (!member) {
      const hostName = session.users?.display_name || 'the host';
      return res.json({ success: true, kicked: true, hostName });
    }

    await supabase.from('session_members')
      .update({ last_seen_at: new Date().toISOString() })
      .eq('session_id', req.params.id)
      .eq('user_id', userId);

    res.json({ success: true, kicked: false });
  } catch (err) { next(err); }
});

// Get guest allowlist (host only)
router.get('/:id/allowlist', authMiddleware, async (req, res, next) => {
  try {
    const session = await fetchSession(req.params.id);
    if (!session) return res.status(404).json({ success: false, error: 'Session not found' });
    if (session.hostUserId !== req.user.id)
      return res.status(403).json({ success: false, error: 'Only the host can view the guest list' });

    const { data: rows } = await supabase
      .from('session_allowlist').select('*').eq('session_id', req.params.id).order('added_at', { ascending: true });
    res.json({ success: true, data: (rows || []).map(mapAllowlistEntry) });
  } catch (err) { next(err); }
});

// Add to allowlist (host only)
router.post('/:id/allowlist', authMiddleware, requireFeature('guestList'), async (req, res, next) => {
  try {
    const { name } = req.body;
    if (!name?.trim()) return res.status(400).json({ success: false, error: 'name required' });

    const session = await fetchSession(req.params.id);
    if (!session) return res.status(404).json({ success: false, error: 'Session not found' });
    if (session.hostUserId !== req.user.id)
      return res.status(403).json({ success: false, error: 'Only the host can manage the guest list' });

    const { data: duplicate } = await supabase
      .from('session_allowlist').select('id').eq('session_id', session.id).ilike('name', name.trim()).maybeSingle();
    if (duplicate) return res.status(409).json({ success: false, error: 'Name already on the list' });

    await supabase.from('session_allowlist').insert({ session_id: session.id, name: name.trim() });
    const { data: rows } = await supabase
      .from('session_allowlist').select('*').eq('session_id', session.id).order('added_at', { ascending: true });
    res.status(201).json({ success: true, data: (rows || []).map(mapAllowlistEntry) });
  } catch (err) { next(err); }
});

// Remove from allowlist (host only)
router.delete('/:id/allowlist/:entryId', authMiddleware, async (req, res, next) => {
  try {
    const session = await fetchSession(req.params.id);
    if (!session) return res.status(404).json({ success: false, error: 'Session not found' });
    if (session.hostUserId !== req.user.id)
      return res.status(403).json({ success: false, error: 'Only the host can manage the guest list' });

    await supabase.from('session_allowlist').delete().eq('id', req.params.entryId).eq('session_id', session.id);
    res.json({ success: true });
  } catch (err) { next(err); }
});

module.exports = router;
