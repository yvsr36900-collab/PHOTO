require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { initDb } = require('./db/schema');

const authRoutes = require('./routes/auth');
const sessionRoutes = require('./routes/sessions');
const photoRoutes = require('./routes/photos');
const exportRoutes = require('./routes/export');
const rsvpRoutes = require('./routes/rsvp');
const googleRoutes = require('./routes/google');
const syncRoutes = require('./routes/sync');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({ origin: 'http://localhost:5173', credentials: true }));
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.use('/api/auth', authRoutes);
app.use('/api/sessions', sessionRoutes);
app.use('/api/photos', photoRoutes);
app.use('/api/export', exportRoutes);
app.use('/api/rsvp', rsvpRoutes);
app.use('/auth/google', googleRoutes);
app.use('/api/sync', syncRoutes);

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ success: false, error: err.message || 'Internal server error' });
});

initDb();

app.listen(PORT, () => {
  console.log(`SnapGather server running on http://localhost:${PORT}`);
});
