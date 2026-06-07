const router = require('express').Router();
const archiver = require('archiver');
const path = require('path');
const fs = require('fs');
const { getDb } = require('../db/schema');
const { optionalAuth, authMiddleware } = require('../middleware/authMiddleware');
const { requireFeature } = require('../middleware/planEnforcer');
const { google } = require('googleapis');

// ZIP export — all plans
router.get('/zip/:sessionId', optionalAuth, (req, res) => {
  const db = getDb();
  const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(req.params.sessionId);
  if (!session) return res.status(404).json({ success: false, error: 'Session not found' });

  const photos = db.prepare('SELECT * FROM photos WHERE sessionId = ?').all(req.params.sessionId);
  if (photos.length === 0)
    return res.status(404).json({ success: false, error: 'No photos in this session' });

  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="${session.name.replace(/[^a-z0-9]/gi, '_')}_photos.zip"`);

  const archive = archiver('zip', { zlib: { level: 6 } });
  archive.on('error', (err) => { throw err; });
  archive.pipe(res);

  photos.forEach((photo) => {
    const filePath = path.join(__dirname, '..', 'uploads', photo.filename);
    if (fs.existsSync(filePath)) {
      archive.file(filePath, { name: photo.originalName || photo.filename });
    }
  });

  archive.finalize();
});

// Google Drive export — premium only
router.post('/drive/:sessionId', authMiddleware, requireFeature('driveExport'), async (req, res) => {
  const db = getDb();
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);

  if (!user.googleAccessToken)
    return res.status(401).json({ success: false, error: 'Google Drive not connected. Please authorize first.' });

  const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(req.params.sessionId);
  if (!session) return res.status(404).json({ success: false, error: 'Session not found' });

  const photos = db.prepare('SELECT * FROM photos WHERE sessionId = ?').all(req.params.sessionId);
  if (photos.length === 0)
    return res.status(404).json({ success: false, error: 'No photos to export' });

  const oauth2Client = createOAuthClient();
  oauth2Client.setCredentials({
    access_token: user.googleAccessToken,
    refresh_token: user.googleRefreshToken,
  });

  const drive = google.drive({ version: 'v3', auth: oauth2Client });

  try {
    // Create a folder
    const folder = await drive.files.create({
      requestBody: { name: `SnapGather - ${session.name}`, mimeType: 'application/vnd.google-apps.folder' },
      fields: 'id',
    });
    const folderId = folder.data.id;

    const uploaded = [];
    for (const photo of photos) {
      const filePath = path.join(__dirname, '..', 'uploads', photo.filename);
      if (!fs.existsSync(filePath)) continue;
      const ext = path.extname(photo.filename).toLowerCase();
      const mimeMap = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.gif': 'image/gif', '.webp': 'image/webp' };
      const mimeType = mimeMap[ext] || 'application/octet-stream';

      const fileRes = await drive.files.create({
        requestBody: { name: photo.originalName || photo.filename, parents: [folderId] },
        media: { mimeType, body: fs.createReadStream(filePath) },
        fields: 'id,name',
      });
      uploaded.push(fileRes.data.name);
    }

    res.json({ success: true, data: { uploaded: uploaded.length, folderId } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

function createOAuthClient() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
}

module.exports = router;
