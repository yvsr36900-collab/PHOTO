const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { getDb } = require('../db/schema');
const { authMiddleware } = require('../middleware/authMiddleware');

function makeToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, displayName: user.displayName, plan: user.plan },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );
}

router.post('/register', (req, res) => {
  const { email, password, displayName } = req.body;
  if (!email || !password || !displayName)
    return res.status(400).json({ success: false, error: 'All fields required' });

  const db = getDb();
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (existing) return res.status(409).json({ success: false, error: 'Email already registered' });

  const passwordHash = bcrypt.hashSync(password, 10);
  const result = db.prepare(
    'INSERT INTO users (email, passwordHash, displayName, plan) VALUES (?, ?, ?, ?)'
  ).run(email, passwordHash, displayName, 'free');

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json({ success: true, data: { token: makeToken(user), user: safeUser(user) } });
});

router.post('/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password)
    return res.status(400).json({ success: false, error: 'Email and password required' });

  const db = getDb();
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user || !bcrypt.compareSync(password, user.passwordHash))
    return res.status(401).json({ success: false, error: 'Invalid credentials' });

  res.json({ success: true, data: { token: makeToken(user), user: safeUser(user) } });
});

router.get('/me', authMiddleware, (req, res) => {
  const db = getDb();
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!user) return res.status(404).json({ success: false, error: 'User not found' });
  res.json({ success: true, data: safeUser(user) });
});

function safeUser(u) {
  return { id: u.id, email: u.email, displayName: u.displayName, plan: u.plan, createdAt: u.createdAt };
}

module.exports = router;
