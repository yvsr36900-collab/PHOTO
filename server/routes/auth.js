const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { supabase, mapUser } = require('../db/supabase');
const { authMiddleware } = require('../middleware/authMiddleware');

function makeToken(user) {
  // user is already camelCase (via mapUser)
  return jwt.sign(
    { id: user.id, email: user.email, displayName: user.displayName, plan: user.plan },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );
}

function safeUser(u) {
  return { id: u.id, email: u.email, displayName: u.displayName, plan: u.plan, createdAt: u.createdAt };
}

router.post('/register', async (req, res, next) => {
  try {
    const { email, password, displayName } = req.body;
    if (!email || !password || !displayName)
      return res.status(400).json({ success: false, error: 'All fields required' });

    const { data: existing } = await supabase
      .from('users').select('id').eq('email', email).maybeSingle();
    if (existing) return res.status(409).json({ success: false, error: 'Email already registered' });

    const passwordHash = bcrypt.hashSync(password, 10);
    const { data: raw, error } = await supabase
      .from('users')
      .insert({ email, password_hash: passwordHash, display_name: displayName, plan: 'free' })
      .select().single();

    if (error) throw error;
    const user = mapUser(raw);
    res.status(201).json({ success: true, data: { token: makeToken(user), user: safeUser(user) } });
  } catch (err) { next(err); }
});

router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (!email || !password)
      return res.status(400).json({ success: false, error: 'Email and password required' });

    const { data: raw } = await supabase
      .from('users').select('*').eq('email', email).maybeSingle();

    if (!raw || !bcrypt.compareSync(password, raw.password_hash))
      return res.status(401).json({ success: false, error: 'Invalid credentials' });

    const user = mapUser(raw);
    res.json({ success: true, data: { token: makeToken(user), user: safeUser(user) } });
  } catch (err) { next(err); }
});

router.get('/me', authMiddleware, async (req, res, next) => {
  try {
    const { data: raw } = await supabase
      .from('users').select('*').eq('id', req.user.id).single();
    if (!raw) return res.status(404).json({ success: false, error: 'User not found' });
    res.json({ success: true, data: safeUser(mapUser(raw)) });
  } catch (err) { next(err); }
});

module.exports = router;
