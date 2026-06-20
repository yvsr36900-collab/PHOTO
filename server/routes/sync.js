const router = require('express').Router();
const fs = require('fs');
const path = require('path');
const { supabase } = require('../db/supabase');
const { authMiddleware } = require('../middleware/authMiddleware');
const { startWatcher, stopWatcher, getStatus, getPending, confirmUpload } = require('../sync/watcher');

async function getSessionAndCheckHost(req, res) {
  const { data: session } = await supabase
    .from('sessions').select('*').eq('id', req.params.sessionId).single();
  if (!session) { res.status(404).json({ success: false, error: 'Session not found' }); return null; }
  if (session.host_user_id !== req.user.id) {
    res.status(403).json({ success: false, error: 'Only the session host can manage photo sync' });
    return null;
  }
  return session;
}

// GET status
router.get('/:sessionId/status', authMiddleware, async (req, res, next) => {
  try {
    const session = await getSessionAndCheckHost(req, res);
    if (!session) return;
    res.json({ success: true, data: getStatus(req.params.sessionId) });
  } catch (err) { next(err); }
});

// POST start
router.post('/:sessionId/start', authMiddleware, async (req, res, next) => {
  try {
    const session = await getSessionAndCheckHost(req, res);
    if (!session) return;

    if (new Date(session.expires_at) <= new Date())
      return res.status(410).json({ success: false, error: 'Session has expired' });

    const { watchPath } = req.body;
    if (watchPath && /\.photoslibrary/i.test(watchPath))
      return res.status(400).json({ success: false, error: 'The Photos Library bundle cannot be watched directly. Export photos to Downloads or Desktop instead.' });

    const { data: user } = await supabase.from('users').select('display_name').eq('id', req.user.id).single();
    const state = startWatcher(req.params.sessionId, watchPath || null, user?.display_name || 'Sync');

    res.json({ success: true, data: { watchPath: state.watchPath, message: 'Photo sync started' } });
  } catch (err) { next(err); }
});

// POST stop
router.post('/:sessionId/stop', authMiddleware, async (req, res, next) => {
  try {
    const session = await getSessionAndCheckHost(req, res);
    if (!session) return;
    stopWatcher(req.params.sessionId);
    res.json({ success: true, data: { message: 'Photo sync stopped' } });
  } catch (err) { next(err); }
});

// GET pending list (host only)
router.get('/:sessionId/pending', authMiddleware, async (req, res, next) => {
  try {
    const session = await getSessionAndCheckHost(req, res);
    if (!session) return;
    res.json({ success: true, data: getPending(req.params.sessionId) });
  } catch (err) { next(err); }
});

// GET pending image thumbnail
router.get('/:sessionId/pending/:filename', (req, res) => {
  const base = path.join(__dirname, '..', 'pending', req.params.sessionId);
  const filePath = path.join(base, req.params.filename);
  if (!filePath.startsWith(base + path.sep) && filePath !== base) return res.status(400).end();
  if (!fs.existsSync(filePath)) return res.status(404).end();
  res.sendFile(filePath);
});

// POST confirm — uploads selected pending files to Supabase Storage
router.post('/:sessionId/confirm', authMiddleware, async (req, res, next) => {
  try {
    const session = await getSessionAndCheckHost(req, res);
    if (!session) return;

    const { selected } = req.body;
    if (!Array.isArray(selected))
      return res.status(400).json({ success: false, error: 'selected must be an array of filenames' });

    const result = await confirmUpload(req.params.sessionId, selected);
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
});

module.exports = router;
