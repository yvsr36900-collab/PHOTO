const jwt = require('jsonwebtoken');

function authMiddleware(req, res, next) {
  const header = req.headers['authorization'];
  if (!header) return res.status(401).json({ success: false, error: 'No token provided' });

  const token = header.startsWith('Bearer ') ? header.slice(7) : header;
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ success: false, error: 'Invalid or expired token' });
  }
}

function optionalAuth(req, res, next) {
  const header = req.headers['authorization'];
  if (header) {
    const token = header.startsWith('Bearer ') ? header.slice(7) : header;
    try {
      req.user = jwt.verify(token, process.env.JWT_SECRET);
    } catch {
      req.user = null;
    }
  }
  next();
}

module.exports = { authMiddleware, optionalAuth };
