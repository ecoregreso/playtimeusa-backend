// server.js — unified Express server with Mongo
require('dotenv').config();

const path = require('path');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');

const { connectDB } = require('./utils/db');

// routes
const cashierRoutes = require('./routes/cashierRoutes');
const playerRoutes = require('./routes/playerRoutes');
const adminRoutes = require('./routes/adminRoutes');

const PORT = process.env.PORT || 3000;
const CORS_ORIGINS = (process.env.CORS_ORIGINS || '*')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const ADMIN_KEY = process.env.ADMIN_KEY || process.env.X_ADMIN_KEY || 'dev-admin-key';

const app = express();

// security & compression
app.use(helmet());

// cors
const corsOptions = {
  origin: (_origin, cb) => cb(null, true),
  credentials: true
};
if (!(CORS_ORIGINS.length === 1 && CORS_ORIGINS[0] === '*')) {
  corsOptions.origin = (origin, callback) => {
    if (!origin) return callback(null, true);
    const ok = CORS_ORIGINS.includes(origin);
    callback(ok ? null : new Error('Not allowed by CORS'), ok);
  };
}
app.use(cors(corsOptions));

app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// health check for Render
app.get('/health', (_req, res) => res.json({ ok: true }));

// simple admin auth middleware for cashier endpoints
function requireAdminKey(req, res, next) {
  const k = req.headers['x-admin-key'];
  if (k && k === ADMIN_KEY) return next();
  return res.status(401).json({ error: 'admin_unauthorized' });
}

// mount routes
app.use('/api/cashier', requireAdminKey, cashierRoutes);
app.use('/api/player', playerRoutes);
app.use('/api/admin', adminRoutes);

// static files for cashier/login UIs
app.use('/', express.static(path.join(__dirname, 'public')));

async function start() {
  await connectDB();
  app.listen(PORT, () => console.log(`playtimeusa-backend listening on :${PORT}`));
}

start().catch((err) => {
  console.error('Failed to start server', err);
  process.exit(1);
});
