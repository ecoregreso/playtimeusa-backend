// server.js
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');

const app = express();

// --- Core middleware ---
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// CORS: allow localhost and one configurable origin
const allowedOrigins = new Set([
  'http://localhost:3000',
  process.env.ALLOWED_ORIGIN || ''
].filter(Boolean));

app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin) return cb(null, true); // curl or same-origin
      return cb(null, allowedOrigins.has(origin));
    },
    credentials: true
  })
);

// --- Database (optional but safe) ---
const mongoUri = process.env.MONGODB_URI || process.env.DATABASE_URL;
if (mongoUri) {
  mongoose
    .connect(mongoUri, { autoIndex: true })
    .then(() => console.log('MongoDB connected'))
    .catch(err => {
      console.error('MongoDB connection error', err);
      // Do not exit; allow health check to fail instead of crashlooping
    });
}

// --- Health check ---
app.get('/healthz', (req, res) => {
  res.status(200).send('ok');
});

// --- Example root (optional) ---
app.get('/', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

// TODO: mount your routes here, e.g.:
// const voucherRoutes = require('./routes/voucher');
// app.use('/api/v1/vouchers', voucherRoutes);

// --- Start server ---
const PORT = process.env.PORT || 10000;
const HOST = '0.0.0.0';

app.listen(PORT, HOST, () => {
  console.log(`listening on http://${HOST}:${PORT}`);
});

module.exports = app;
