const router = require('express').Router();
const multer = require('multer');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { supabase, mapPhoto } = require('../db/supabase');
const { optionalAuth } = require('../middleware/authMiddleware');
const { enforcePhotoLimit } = require('../middleware/planEnforcer');

// Use memory storage — file goes straight to Supabase Storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB (Supabase free limit)
  fileFilter: (req, file, cb) => {
    const allowed = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
    if (allowed.includes(path.extname(file.originalname).toLowerCase())) cb(null, true);
    else cb(new Error('Only image files are allowed'));
  },
});

// Upload photo to session
router.post('/session/:sessionId', optionalAuth, upload.single('photo'), enforcePhotoLimit, async (req, res, next) => {
  try {
    const { data: sessionRaw } = await supabase
      .from('sessions').select('*').eq('id', req.params.sessionId).single();
    if (!sessionRaw) return res.status(404).json({ success: false, error: 'Session not found' });

    if (sessionRaw.status === 'stopped')
      return res.status(403).json({ success: false, error: 'Session is paused — the host must restart it before new photos can be uploaded' });

    if (new Date(sessionRaw.expires_at) <= new Date())
      return res.status(410).json({ success: false, error: 'Session has expired' });

    if (!req.file) return res.status(400).json({ success: false, error: 'No file uploaded' });

    const uploadedByUserId = req.user ? String(req.user.id) : (req.body.guestId || `guest_${uuidv4()}`);
    const uploadedByName = req.user ? req.user.displayName : (req.body.displayName || 'Anonymous');

    const ext = path.extname(req.file.originalname).toLowerCase();
    const storagePath = `${req.params.sessionId}/${uuidv4()}${ext}`;

    // Upload buffer to Supabase Storage
    const { error: storageError } = await supabase.storage
      .from('photos')
      .upload(storagePath, req.file.buffer, { contentType: req.file.mimetype, upsert: false });

    if (storageError) throw storageError;

    const { data: { publicUrl } } = supabase.storage.from('photos').getPublicUrl(storagePath);

    const { data: raw, error: dbError } = await supabase
      .from('photos')
      .insert({
        session_id: req.params.sessionId,
        uploaded_by_user_id: uploadedByUserId,
        uploaded_by_name: uploadedByName,
        storage_path: storagePath,
        url: publicUrl,
        original_name: req.file.originalname,
      })
      .select().single();

    if (dbError) throw dbError;
    res.status(201).json({ success: true, data: mapPhoto(raw) });
  } catch (err) { next(err); }
});

// Get photos for a session
router.get('/session/:sessionId', optionalAuth, async (req, res, next) => {
  try {
    const { data: rows } = await supabase
      .from('photos').select('*').eq('session_id', req.params.sessionId).order('uploaded_at', { ascending: true });
    res.json({ success: true, data: (rows || []).map(mapPhoto) });
  } catch (err) { next(err); }
});

// Delete a photo (uploader or session host)
router.delete('/:photoId', optionalAuth, async (req, res, next) => {
  try {
    const { data: raw } = await supabase.from('photos').select('*').eq('id', req.params.photoId).single();
    if (!raw) return res.status(404).json({ success: false, error: 'Photo not found' });

    const photo = mapPhoto(raw);
    const requesterId = req.user ? String(req.user.id) : req.body.guestId;

    const { data: sessionRaw } = await supabase.from('sessions').select('host_user_id').eq('id', photo.sessionId).single();

    const isUploader = photo.uploadedByUserId === requesterId;
    const isHost = req.user && sessionRaw && sessionRaw.host_user_id === req.user.id;

    if (!isUploader && !isHost)
      return res.status(403).json({ success: false, error: 'Not authorized to delete this photo' });

    // Remove from Supabase Storage
    await supabase.storage.from('photos').remove([raw.storage_path]);
    await supabase.from('photos').delete().eq('id', photo.id);

    res.json({ success: true, data: { deleted: true } });
  } catch (err) { next(err); }
});

module.exports = router;
