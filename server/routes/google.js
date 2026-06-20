const router = require('express').Router();
const { google } = require('googleapis');
const { supabase } = require('../db/supabase');
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

    await supabase.from('users').update({
      google_access_token: tokens.access_token,
      google_refresh_token: tokens.refresh_token || null,
    }).eq('id', userId);

    res.send('<script>window.close();</script><p>Google Drive connected! You can close this window.</p>');
  } catch (err) {
    res.status(500).send('OAuth failed: ' + err.message);
  }
});

// Check connection status
router.get('/status', authMiddleware, async (req, res, next) => {
  try {
    const { data: user } = await supabase.from('users').select('google_access_token').eq('id', req.user.id).single();
    res.json({ success: true, data: { connected: !!user?.google_access_token } });
  } catch (err) { next(err); }
});

// Disconnect Google Drive
router.post('/disconnect', authMiddleware, async (req, res, next) => {
  try {
    await supabase.from('users').update({ google_access_token: null, google_refresh_token: null }).eq('id', req.user.id);
    res.json({ success: true, data: { disconnected: true } });
  } catch (err) { next(err); }
});

module.exports = router;
