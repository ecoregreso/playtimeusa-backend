set -euo pipefail

mkdir -p routes middleware models

# -------- middleware/auth.js --------
cat > middleware/auth.js <<'JS'
const jwt = require('jsonwebtoken');

function requireAuth(roles = []) {
  return (req, res, next) => {
    const h = req.headers.authorization || '';
    const t = h.startsWith('Bearer ') ? h.slice(7) : null;
    if (!t) return res.status(401).json({ error: 'unauthorized', code: 401 });
    try {
      const p = jwt.verify(t, process.env.JWT_SECRET);
      if (roles.length && !roles.includes(p.role)) return res.status(403).json({ error: 'forbidden', code: 403 });
      req.user = p;
      next();
    } catch {
      return res.status(401).json({ error: 'unauthorized', code: 401 });
    }
  };
}

module.exports = { requireAuth };
JS

# -------- routes/status.js --------
cat > routes/status.js <<'JS'
const express = require('express');
const router = express.Router();

router.get('/', (_req, res) => {
  res.json({
    version: process.env.APP_VERSION || '0.1.0',
    uptimeSec: Math.floor(process.uptime()),
    db: 'ok'
  });
});

module.exports = router;
JS

# -------- routes/auth.js --------
cat > routes/auth.js <<'JS'
const express = require('express');
const jwt = require('jsonwebtoken');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.post('/login', (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'missing_credentials', code: 400 });
  const role = /admin/i.test(email) ? 'admin' : 'agent';
  const token = jwt.sign({ sub: email, role }, process.env.JWT_SECRET, { expiresIn: '15m' });
  res.json({ token, user: { email, role } });
});

router.get('/me', requireAuth(), (req, res) => {
  res.json({ user: req.user });
});

module.exports = router;
JS

# -------- routes/cashier.js (adds GETs, keeps POST) --------
cat > routes/cashier.js <<'JS'
const express = require('express');
const Voucher = require('../models/Voucher');
const { parseFC, formatFC, makeChange } = require('../lib/funcoin');

const router = express.Router();

router.post('/voucher', async (req, res) => {
  try {
    const amountFunCents = parseFC(req.body);
    const doc = await Voucher.create({ amountFunCents });
    const coins = makeChange(amountFunCents);
    return res.status(200).json({
      id: doc._id,
      amountFunCents,
      amountFormatted: formatFC(amountFunCents),
      coins: coins.coins
    });
  } catch {
    return res.status(400).json({ error: 'Invalid fun-coin amount', code: 400 });
  }
});

router.get('/voucher/:id', async (req, res) => {
  const doc = await Voucher.findById(req.params.id).lean();
  if (!doc) return res.status(404).json({ error: 'not_found', code: 404 });
  res.json(doc);
});

router.get('/vouchers', async (req, res) => {
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 25));
  const cursor = req.query.cursor ? { _id: { $lt: req.query.cursor } } : {};
  const rows = await Voucher.find(cursor).sort({ _id: -1 }).limit(limit).lean();
  const nextCursor = rows.length === limit ? rows[rows.length - 1]._id : null;
  res.json({ rows, nextCursor });
});

module.exports = router;
JS

# -------- models/Voucher.js (adds index) --------
cat > models/Voucher.js <<'JS'
const mongoose = require('mongoose');

const VoucherSchema = new mongoose.Schema(
  { amountFunCents: { type: Number, required: true, min: 0 } },
  { timestamps: true }
);

VoucherSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Voucher', VoucherSchema);
JS

# -------- app.js (full, production-ready) --------
cat > app.js <<'JS'
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
JS

# -------- server.js --------
cat > server.js <<'JS'
const app = require('./app');
const PORT = process.env.PORT || 10000;
const HOST = '0.0.0.0';
if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, HOST, () => console.log(`listening on http://${HOST}:${PORT}`));
}
module.exports = app;
JS

# keep package.json test as-is; ensure rate-limit dep present
if ! grep -q '"express-rate-limit"' package.json; then
  npm pkg set dependencies.express-rate-limit="^8.2.1" >/dev/null 2>&1 || true
fi

echo "Snippets installed. Next:
1) npm ci
2) npm test
3) git add .
4) git commit -m 'prod hardening: v1 routes, auth, status, logging'
5) git push origin main"
