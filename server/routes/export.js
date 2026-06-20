const router = require('express').Router();
const archiver = require('archiver');
const { supabase, mapPhoto } = require('../db/supabase');
const { optionalAuth, authMiddleware } = require('../middleware/authMiddleware');
const { requireFeature } = require('../middleware/planEnforcer');
const { google } = require('googleapis');
const { Readable } = require('stream');

// ZIP export — all plans
router.get('/zip/:sessionId', optionalAuth, async (req, res, next) => {
  try {
    const { data: session } = await supabase.from('sessions').select('name').eq('id', req.params.sessionId).single();
    if (!session) return res.status(404).json({ success: false, error: 'Session not found' });

    const { data: rows } = await supabase.from('photos').select('*').eq('session_id', req.params.sessionId);
    if (!rows || rows.length === 0)
      return res.status(404).json({ success: false, error: 'No photos in this session' });

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${session.name.replace(/[^a-z0-9]/gi, '_')}_photos.zip"`);

    const archive = archiver('zip', { zlib: { level: 6 } });
    archive.on('error', (err) => next(err));
    archive.pipe(res);

    for (const row of rows) {
      const { data: blob } = await supabase.storage.from('photos').download(row.storage_path);
      if (blob) {
        const buf = Buffer.from(await blob.arrayBuffer());
        archive.append(buf, { name: row.original_name || row.storage_path });
      }
    }

    archive.finalize();
  } catch (err) { next(err); }
});

// Google Drive export — premium only
router.post('/drive/:sessionId', authMiddleware, requireFeature('driveExport'), async (req, res, next) => {
  try {
    const { data: userRaw } = await supabase.from('users').select('*').eq('id', req.user.id).single();
    if (!userRaw?.google_access_token)
      return res.status(401).json({ success: false, error: 'Google Drive not connected. Please authorize first.' });

    const { data: session } = await supabase.from('sessions').select('name').eq('id', req.params.sessionId).single();
    if (!session) return res.status(404).json({ success: false, error: 'Session not found' });

    const { data: rows } = await supabase.from('photos').select('*').eq('session_id', req.params.sessionId);
    if (!rows || rows.length === 0)
      return res.status(404).json({ success: false, error: 'No photos to export' });

    const oauth2Client = createOAuthClient();
    oauth2Client.setCredentials({
      access_token: userRaw.google_access_token,
      refresh_token: userRaw.google_refresh_token,
    });

    const drive = google.drive({ version: 'v3', auth: oauth2Client });

    const folder = await drive.files.create({
      requestBody: { name: `SnapGather - ${session.name}`, mimeType: 'application/vnd.google-apps.folder' },
      fields: 'id',
    });
    const folderId = folder.data.id;

    const uploaded = [];
    const mimeMap = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.gif': 'image/gif', '.webp': 'image/webp' };

    for (const row of rows) {
      const { data: blob } = await supabase.storage.from('photos').download(row.storage_path);
      if (!blob) continue;
      const buf = Buffer.from(await blob.arrayBuffer());
      const ext = (row.original_name || '').split('.').pop();
      const mimeType = mimeMap[`.${ext}`] || 'application/octet-stream';

      const fileRes = await drive.files.create({
        requestBody: { name: row.original_name || row.storage_path, parents: [folderId] },
        media: { mimeType, body: Readable.from(buf) },
        fields: 'id,name',
      });
      uploaded.push(fileRes.data.name);
    }

    res.json({ success: true, data: { uploaded: uploaded.length, folderId } });
  } catch (err) { next(err); }
});

function createOAuthClient() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
}

module.exports = router;
