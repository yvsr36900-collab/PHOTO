const router = require('express').Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../db/schema');
const { optionalAuth } = require('../middleware/authMiddleware');
const { enforcePhotoLimit } = require('../middleware/planEnforcer');

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(__dirname, '..', 'uploads')),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${uuidv4()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
    if (allowed.includes(path.extname(file.originalname).toLowerCase())) cb(null, true);
    else cb(new Error('Only image files are allowed'));
  },
});

// Upload photo to session
router.post('/session/:sessionId', optionalAuth, (req, res, next) => {
  // Inject userId and displayName into req.body before multer runs
  // We read them from the form fields after upload
  next();
}, upload.single('photo'), enforcePhotoLimit, (req, res) => {
  const db = getDb();
  const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(req.params.sessionId);
  if (!session) return res.status(404).json({ success: false, error: 'Session not found' });

  if (session.status === 'stopped')
    return res.status(403).json({ success: false, error: 'Session is paused — the host must restart it before new photos can be uploaded' });

  if (new Date(session.expiresAt) <= new Date())
    return res.status(410).json({ success: false, error: 'Session has expired' });

  if (!req.file) return res.status(400).json({ success: false, error: 'No file uploaded' });

  const uploadedByUserId = req.user ? String(req.user.id) : (req.body.guestId || `guest_${uuidv4()}`);
  const uploadedByName = req.user ? req.user.displayName : (req.body.displayName || 'Anonymous');

  const result = db.prepare(
    'INSERT INTO photos (sessionId, uploadedByUserId, uploadedByName, filename, originalName) VALUES (?, ?, ?, ?, ?)'
  ).run(req.params.sessionId, uploadedByUserId, uploadedByName, req.file.filename, req.file.originalname);

  const photo = db.prepare('SELECT * FROM photos WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json({ success: true, data: photo });
});

// Get photos for a session
router.get('/session/:sessionId', optionalAuth, (req, res) => {
  const db = getDb();
  const photos = db.prepare('SELECT * FROM photos WHERE sessionId = ? ORDER BY uploadedAt ASC').all(req.params.sessionId);
  res.json({ success: true, data: photos });
});

// Delete a photo (uploader or session host)
router.delete('/:photoId', optionalAuth, (req, res) => {
  const db = getDb();
  const photo = db.prepare('SELECT * FROM photos WHERE id = ?').get(req.params.photoId);
  if (!photo) return res.status(404).json({ success: false, error: 'Photo not found' });

  const requesterId = req.user ? String(req.user.id) : req.body.guestId;
  const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(photo.sessionId);

  const isUploader = photo.uploadedByUserId === requesterId;
  const isHost = req.user && session && session.hostUserId === req.user.id;

  if (!isUploader && !isHost)
    return res.status(403).json({ success: false, error: 'Not authorized to delete this photo' });

  const filePath = path.join(__dirname, '..', 'uploads', photo.filename);
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

  db.prepare('DELETE FROM photos WHERE id = ?').run(photo.id);
  res.json({ success: true, data: { deleted: true } });
});

module.exports = router;
