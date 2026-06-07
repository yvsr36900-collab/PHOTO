const router = require('express').Router();
const { google } = require('googleapis');
const { getDb } = require('../db/schema');
const { authMiddleware } = require('../middleware/authMiddleware');

function createOAuthClient() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
}

// Initiate Google OAuth
router.get('/connect', authMiddleware, (req, res) => {
  const oauth2Client = createOAuthClient();
  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: ['https://www.googleapis.com/auth/drive.file'],
    state: String(req.user.id),
  });
  res.json({ success: true, data: { authUrl: url } });
});

// OAuth callback
router.get('/callback', async (req, res) => {
  const { code, state: userId } = req.query;
  if (!code || !userId) return res.status(400).send('Missing code or state');

  try {
    const oauth2Client = createOAuthClient();
    const { tokens } = await oauth2Client.getToken(code);

    const db = getDb();
    db.prepare('UPDATE users SET googleAccessToken = ?, googleRefreshToken = ? WHERE id = ?')
      .run(tokens.access_token, tokens.refresh_token || null, userId);

    res.send('<script>window.close();</script><p>Google Drive connected! You can close this window.</p>');
  } catch (err) {
    res.status(500).send('OAuth failed: ' + err.message);
  }
});

// Check connection status
router.get('/status', authMiddleware, (req, res) => {
  const db = getDb();
  const user = db.prepare('SELECT googleAccessToken FROM users WHERE id = ?').get(req.user.id);
  res.json({ success: true, data: { connected: !!user?.googleAccessToken } });
});

// Disconnect Google Drive
router.post('/disconnect', authMiddleware, (req, res) => {
  const db = getDb();
  db.prepare('UPDATE users SET googleAccessToken = NULL, googleRefreshToken = NULL WHERE id = ?').run(req.user.id);
  res.json({ success: true, data: { disconnected: true } });
});

module.exports = router;
