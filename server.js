// server.js — PlaytimeUSA backend (production-hardened)
// - Mongo Atlas in prod via MONGO_URI
// - CORS allowlist via CORS_ORIGINS (comma-separated) or FRONTEND_URL
// - Rate limits for /api and /api/player/login
// - Helmet + HSTS (in production), trust proxy for Render
// - Minimal voucher → login → balance → spin loop

require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const QRCode = require('qrcode');
const rateLimit = require('express-rate-limit');
const morgan = require('morgan');

// -------------------------------
// Config
// -------------------------------
const app = express();
app.set('trust proxy', 1); // Render/Proxies

const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || 'production';
const JWT_SECRET = process.env.JWT_SECRET || 'CHANGE_THIS_IN_PROD';

const FRONTEND_URL = sanitizeBaseUrl(
  process.env.FRONTEND_URL || 'https://example.com'
);

// CORS allowlist: CORS_ORIGINS=origin1,origin2 OR fallback to FRONTEND_URL
const ALLOWED_ORIGINS = (process.env.CORS_ORIGINS || FRONTEND_URL)
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

// -------------------------------
// Middleware
// -------------------------------
app.use(helmet({
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));
if (NODE_ENV === 'production') {
  app.use(helmet.hsts({ maxAge: 15552000 })); // 180 days
}
app.use(compression());
app.use(express.json({ limit: '2mb' }));
app.use(morgan(NODE_ENV === 'production' ? 'combined' : 'dev'));

app.use(cors({
  origin(origin, cb) {
    // allow curl/postman (no origin)
    if (!origin) return cb(null, true);
    const ok = ALLOWED_ORIGINS.some(o => origin.startsWith(o));
    return cb(ok ? null : new Error('CORS blocked'), ok);
  },
  credentials: false,
}));

// Health
app.get('/health', (_req, res) => res.json({ ok: true, ts: Date.now() }));

// -------------------------------
// DB
// -------------------------------
async function connectMongo() {
  const uri = process.env.MONGO_URI;
  if (!uri) {
    console.error('[DB] Missing MONGO_URI. Set it to your Atlas URI.');
    process.exit(1);
  }
  await mongoose.connect(uri);
  console.log('[DB] Connected to Mongo (Atlas).');
}

// Models (use your files if present; else define inline)
function safeRequire(p) { try { return require(p); } catch { return null; } }

let Voucher = safeRequire('./models/Voucher');
if (!Voucher) {
  const voucherSchema = new mongoose.Schema({
    userCode: { type: String, unique: true, index: true },
    password: { type: String, required: true },
    amount: { type: Number, default: 0 },
    bonus: { type: Number, default: 0 },
    balance: { type: Number, default: 0 },
    isUsed: { type: Boolean, default: false },
    lastLoginAt: Date
  }, { timestamps: true });
  Voucher = mongoose.model('Voucher', voucherSchema);
}

let Transaction = safeRequire('./models/Transaction');
if (!Transaction) {
  const transactionSchema = new mongoose.Schema({
    userCode: { type: String, index: true },
    type: { type: String, enum: ['deposit','bet','win','cashout'], required: true },
    amount: { type: Number, required: true },
    balanceAfter: { type: Number, required: true },
    meta: { type: Object, default: {} }
  }, { timestamps: true });
  Transaction = mongoose.model('Transaction', transactionSchema);
}

// -------------------------------
// Helpers
// -------------------------------
function sanitizeBaseUrl(url) {
  if (!url) return '';
  return url.endsWith('/') ? url.slice(0, -1) : url;
}
function sixDigits() { return Math.floor(100000 + Math.random() * 900000).toString(); }
async function generateUniqueUserCode() {
  for (let i = 0; i < 12; i++) {
    const code = sixDigits();
    if (!await Voucher.findOne({ userCode: code }).lean()) return code;
  }
  return sixDigits() + Math.floor(Math.random() * 10).toString();
}
function signToken(userCode) {
  return jwt.sign({ sub: userCode }, JWT_SECRET, { expiresIn: '7d' });
}
function auth(req, res, next) {
  const token = (req.headers.authorization || '').replace(/^Bearer /, '');
  if (!token) return res.status(401).json({ error: 'Missing token' });
  try {
    req.user = { userCode: jwt.verify(token, JWT_SECRET).sub };
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

// Rate limits
const apiLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 600 }); // 600 req / 15m / IP
const loginLimiter = rateLimit({ windowMs: 10 * 60 * 1000, max: 30 }); // 30 logins / 10m / IP
app.use('/api', apiLimiter);

// -------------------------------
// Cashier
// -------------------------------
app.post('/api/cashier/voucher', async (req, res) => {
  try {
    const amount = Number.parseFloat(req.body?.amount);
    if (!Number.isFinite(amount) || amount <= 0) return res.status(400).json({ error: 'Invalid amount' });
    const bonus = Math.round(amount * 0.5);
    const balance = amount + bonus;

    const userCode = await generateUniqueUserCode();
    const password = sixDigits();

    const voucher = await Voucher.create({ userCode, password, amount, bonus, balance, isUsed: false });
    await Transaction.create({
      userCode, type: 'deposit', amount: balance, balanceAfter: balance,
      meta: { source: 'voucher', amount, bonus }
    });

    const loginUrl = `${FRONTEND_URL}/login?userCode=${encodeURIComponent(userCode)}&pin=${encodeURIComponent(password)}`;
    const qrCode = await QRCode.toDataURL(loginUrl);

    res.json({ userCode, password, amount, bonus, balance, loginUrl, qrCode, createdAt: voucher.createdAt });
  } catch (e) {
    console.error('createVoucher error:', e);
    res.status(500).json({ error: 'Failed to create voucher' });
  }
});

app.get('/api/cashier/vouchers', async (_req, res) => {
  try {
    const list = await Voucher.find().sort({ createdAt: -1 }).limit(50).lean();
    res.json(list.map(v => ({
      userCode: v.userCode, amount: v.amount, bonus: v.bonus,
      balance: v.balance, isUsed: v.isUsed, createdAt: v.createdAt
    })));
  } catch (e) {
    console.error('listVouchers error:', e);
    res.status(500).json({ error: 'Failed to list vouchers' });
  }
});

// -------------------------------
// Player
// -------------------------------
app.post('/api/player/login', loginLimiter, async (req, res) => {
  try {
    const { userCode, password } = req.body || {};
    if (!userCode || !password) return res.status(400).json({ error: 'Missing credentials' });
    const v = await Voucher.findOne({ userCode }).exec();
    if (!v || v.password !== String(password)) return res.status(401).json({ error: 'Invalid code or pin' });
    v.lastLoginAt = new Date();
    await v.save();
    res.json({ token: signToken(userCode), user: { userCode, balance: v.balance } });
  } catch (e) {
    console.error('login error:', e);
    res.status(500).json({ error: 'Login failed' });
  }
});

app.get('/api/player/balance', auth, async (req, res) => {
  try {
    const v = await Voucher.findOne({ userCode: req.user.userCode }).lean();
    if (!v) return res.status(404).json({ error: 'Account not found' });
    res.json({ userCode: v.userCode, balance: v.balance });
  } catch (e) {
    console.error('balance error:', e);
    res.status(500).json({ error: 'Failed to fetch balance' });
  }
});

app.post('/api/player/cashout', auth, async (req, res) => {
  try {
    const v = await Voucher.findOne({ userCode: req.user.userCode }).exec();
    if (!v) return res.status(404).json({ error: 'Account not found' });
    const amount = v.balance || 0;
    v.balance = 0;
    await v.save();
    await Transaction.create({ userCode: v.userCode, type: 'cashout', amount, balanceAfter: v.balance });
    res.json({ ok: true, cashedOut: amount, balance: 0 });
  } catch (e) {
    console.error('cashout error:', e);
    res.status(500).json({ error: 'Cashout failed' });
  }
});

// -------------------------------
// Game
// -------------------------------
app.post('/api/game/spin', auth, async (req, res) => {
  try {
    const bet = Number.parseFloat(req.body?.bet);
    if (!Number.isFinite(bet) || bet <= 0) return res.status(400).json({ error: 'Invalid bet' });

    const v = await Voucher.findOne({ userCode: req.user.userCode }).exec();
    if (!v) return res.status(404).json({ error: 'Account not found' });
    if (v.balance < bet) return res.status(400).json({ error: 'Insufficient balance' });

    // debit bet
    v.balance = Math.max(0, v.balance - bet);
    await Transaction.create({ userCode: v.userCode, type: 'bet', amount: bet, balanceAfter: v.balance });

    // simple payout profile
    const r = Math.random();
    let win = 0;
    if (r < 0.03) win = bet * 20;
    else if (r < 0.13) win = bet * 5;
    else if (r < 0.48) win = bet * 2;

    if (win > 0) {
      v.balance += Math.floor(win);
      await Transaction.create({ userCode: v.userCode, type: 'win', amount: win, balanceAfter: v.balance });
    }
    await v.save();

    res.json({
      result: {
        bet, win, balance: v.balance, ts: Date.now(),
        stops: [0,1,2].map(() => Math.floor(Math.random() * 8))
      }
    });
  } catch (e) {
    console.error('spin error:', e);
    res.status(500).json({ error: 'Spin failed' });
  }
});

// -------------------------------
// Start
// -------------------------------
process.on('unhandledRejection', err => {
  console.error('UNHANDLED REJECTION:', err);
});
process.on('uncaughtException', err => {
  console.error('UNCAUGHT EXCEPTION:', err);
  process.exit(1);
});

(async () => {
  try {
    await connectMongo();
    app.listen(PORT, () => console.log(`▶ PlaytimeUSA API listening on ${PORT}`));
  } catch (e) {
    console.error('Fatal startup error:', e);
    process.exit(1);
  }
})();
