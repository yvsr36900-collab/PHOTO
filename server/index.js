require('dotenv').config();
const express = require('express');
const cors = require('cors');

const authRoutes = require('./routes/auth');
const sessionRoutes = require('./routes/sessions');
const photoRoutes = require('./routes/photos');
const exportRoutes = require('./routes/export');
const rsvpRoutes = require('./routes/rsvp');
const googleRoutes = require('./routes/google');
const syncRoutes = require('./routes/sync');

const app = express();
const PORT = process.env.PORT || 3001;

const allowedOrigins = [
  'http://localhost:5173',
  process.env.CLIENT_URL,
].filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, curl, Render health checks)
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    callback(new Error(`CORS: origin ${origin} not allowed`));
  },
  credentials: true,
}));
app.use(express.json());

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

app.listen(PORT, () => {
  console.log(`SnapGather server running on http://localhost:${PORT}`);
});
