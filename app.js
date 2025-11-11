require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const RateLimit = require('express-rate-limit');
const mongoose = require('mongoose');

const app = express();

// request id and access log
const { randomUUID } = require('crypto');
app.use((req, res, next) => { req.id = randomUUID(); res.set('X-Request-Id', req.id); next(); });
app.use((req, res, next) => {
  const t = Date.now();
  res.on('finish', () => {
    console.log(JSON.stringify({ id: req.id, m: req.method, p: req.originalUrl, s: res.statusCode, ms: Date.now() - t }));
  });
  next();
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// security
app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      "default-src": ["'self'"],
      "img-src": ["'self'", "data:"],
      "script-src": ["'self'"],
      "connect-src": ["'self'"]
    }
  }
}));
app.use(RateLimit({ windowMs: 60_000, max: 120 }));
const loginLimiter = RateLimit({ windowMs: 5*60_000, max: 5 });

// CORS
const allowed = new Set([
  'http://localhost:3000',
  'http://localhost:5173',
  process.env.ALLOWED_ORIGIN || ''
].filter(Boolean));
app.use(cors({ origin: (o, cb) => cb(null, !o || allowed.has(o)), credentials: false }));

// db
const mongoUri = process.env.MONGODB_URI || process.env.DATABASE_URL;
if (mongoUri) mongoose.connect(mongoUri, { autoIndex: true }).then(() => console.log('MongoDB connected')).catch(e => console.error('Mongo error', e));

// health
app.get('/healthz', (_req, res) => res.status(200).send('ok'));
app.get('/readyz', (_req, res) => {
  const state = mongoose.connection.readyState; // 0=disconnected 1=connected 2=connecting 3=disconnecting
  const ok = state === 1 || state === 2;
  res.status(ok ? 200 : 503).send(ok ? 'ok' : 'db-down');
});

// fun-coin guard if present
try { app.use(require('./middleware/funcoin-only')); } catch {}

// routes
const status = require('./routes/status');
const auth = require('./routes/auth');
const cashier = require('./routes/cashier');

app.use('/api/v1/status', status);
app.use('/api/v1/auth/login', loginLimiter);
app.use('/api/v1/auth', auth);
app.use('/api/v1/cashier', cashier);

// root
app.get('/', (_req, res) => res.json({ status: 'ok' }));

// error shape
app.use((err, req, res, _next) => {
  const code = err.status || 500;
  console.error(`[${req.id}]`, err);
  res.status(code).json({ error: err.message || 'internal', code });
});

module.exports = app;
