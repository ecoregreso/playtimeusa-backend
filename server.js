// server.js — PlaytimeUSA backend (Mongo-first, Render-ready)
// - Local dev: optional in-memory Mongo (no DB install)
// - Production (Render): requires MONGO_URI
// - Endpoints:
//   POST   /api/cashier/voucher         -> create voucher (+50% bonus) + QR
//   GET    /api/cashier/vouchers        -> recent vouchers (for quick testing)
//   POST   /api/player/login            -> { userCode, password } -> JWT
//   GET    /api/player/balance          -> auth -> { balance }
//   POST   /api/game/spin               -> auth { bet } -> debit, random win, txns
//   POST   /api/player/cashout          -> auth -> zero balance, txn

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const QRCode = require('qrcode');

// -------------------------------
// Environment / config
// -------------------------------
require('dotenv').config(); // harmless if .env missing

const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'change-me-in-prod';
const FRONTEND_URL = sanitizeBaseUrl(
  process.env.FRONTEND_URL || process.env.PUBLIC_URL || 'http://localhost:5173'
);

// Render sets RENDER="true"
const IS_RENDER = !!process.env.RENDER;
const USE_IN_MEMORY = process.env.USE_IN_MEMORY_DB === 'true' && !IS_RENDER;

// -------------------------------
// App
// -------------------------------
const app = express();

app.use(helmet({
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: 'cross-origin' }
}));
app.use(compression());
app.use(express.json({ limit: '2mb' }));

// CORS: allow your Netlify/FE in prod; allow all on localhost/dev
app.use(cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true);
    const allow = [
      FRONTEND_URL,
      'http://localhost:3000',
      'http://127.0.0.1:3000',
      'http://localhost:5173',
      'http://127.0.0.1:5173'
    ];
    if (allow.some(u => origin.startsWith(u))) return cb(null, true);
    return cb(null, true); // loosen for now; tighten later if you want
  },
  credentials: false
}));

// Basic liveness
app.get('/health', (_req, res) => res.json({ ok: true, ts: Date.now() }));

// -------------------------------
// Mongo: prefer Atlas in prod; in-memory locally if asked
// -------------------------------
async function connectMongo() {
  if (USE_IN_MEMORY) {
    const { MongoMemoryServer } = require('mongodb-memory-server');
    const mongod = await MongoMemoryServer.create();
    const uri = mongod.getUri();
    await mongoose.connect(uri);
    console.log('[DB] Connected to in-memory Mongo');
    return;
  }
  const uri = process.env.MONGO_URI;
  if (!uri) {
    console.error('[DB] Missing MONGO_URI. Set it in Render env vars.');
    process.exit(1);
  }
  await mongoose.connect(uri);
  console.log('[DB] Connected to Mongo (Atlas/remote).');
}

// -------------------------------
// Models (try to require your files; if missing, define inline)
// -------------------------------
function safeRequire(p) {
  try { return require(p); } catch { return null; }
}

let Voucher = safeRequire('./models/Voucher');
if (!Voucher) {
  const voucherSchema = new mongoose.Schema({
    userCode: { type: String, unique: true, index: true },
    password: { type: String, required: true },
    amount: Number,           // original cash deposit
    bonus: Number,            // 50% bonus
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
    type: { type: String, enum: ['deposit', 'bet', 'win', 'cashout'], required: true },
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
function sixDigits() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}
async function generateUniqueUserCode() {
  for (let i = 0; i < 12; i++) {
    const code = sixDigits();
    const exists = await Voucher.findOne({ userCode: code }).lean();
    if (!exists) return code;
  }
  // extreme collision fallback
  return sixDigits() + Math.floor(Math.random() * 10).toString();
}
function signToken(userCode) {
  // 7-day token; adjust as you like
  return jwt.sign({ sub: userCode }, JWT_SECRET, { expiresIn: '7d' });
}
function auth(req, res, next) {
  const hdr = req.headers.authorization || '';
  const token = hdr.startsWith('Bearer ') ? hdr.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Missing token' });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = { userCode: payload.sub };
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

// -------------------------------
// Cashier: create/list vouchers
// -------------------------------
app.post('/api/cashier/voucher', async (req, res) => {
  try {
    const amount = Number.parseFloat(req.body?.amount);
    if (!amount || amount <= 0) return res.status(400).json({ error: 'Invalid amount' });

    const bonus = Math.round(amount * 0.5);
    const balance = amount + bonus;

    const userCode = await generateUniqueUserCode();
    const password = sixDigits();

    const voucher = await Voucher.create({
      userCode, password, amount, bonus, balance, isUsed: false
    });

    await Transaction.create({
      userCode, type: 'deposit', amount: balance, balanceAfter: balance,
      meta: { source: 'voucher', amount, bonus }
    });

    const loginUrl = `${FRONTEND_URL}/login?userCode=${encodeURIComponent(userCode)}&pin=${encodeURIComponent(password)}`;
    const qrCode = await QRCode.toDataURL(loginUrl);

    return res.json({
      userCode, password, amount, bonus, balance, loginUrl, qrCode, createdAt: voucher.createdAt
    });
  } catch (err) {
    console.error('createVoucher error:', err);
    return res.status(500).json({ error: 'Failed to create voucher' });
  }
});

app.get('/api/cashier/vouchers', async (_req, res) => {
  try {
    const list = await Voucher.find().sort({ createdAt: -1 }).limit(50).lean();
    return res.json(list.map(v => ({
      userCode: v.userCode,
      amount: v.amount,
      bonus: v.bonus,
      balance: v.balance,
      isUsed: v.isUsed,
      createdAt: v.createdAt
    })));
  } catch (err) {
    console.error('listVouchers error:', err);
    return res.status(500).json({ error: 'Failed to list vouchers' });
  }
});

// -------------------------------
// Player: login / balance / cashout
// -------------------------------
app.post('/api/player/login', async (req, res) => {
  try {
    const { userCode, password } = req.body || {};
    if (!userCode || !password) return res.status(400).json({ error: 'Missing credentials' });

    const voucher = await Voucher.findOne({ userCode }).exec();
    if (!voucher || voucher.password !== String(password)) {
      return res.status(401).json({ error: 'Invalid code or pin' });
    }

    voucher.lastLoginAt = new Date();
    await voucher.save();

    const token = signToken(userCode);
    return res.json({
      token,
      user: { userCode, balance: voucher.balance }
    });
  } catch (err) {
    console.error('login error:', err);
    return res.status(500).json({ error: 'Login failed' });
  }
});

app.get('/api/player/balance', auth, async (req, res) => {
  try {
    const v = await Voucher.findOne({ userCode: req.user.userCode }).lean();
    if (!v) return res.status(404).json({ error: 'Account not found' });
    return res.json({ userCode: v.userCode, balance: v.balance });
  } catch (err) {
    console.error('balance error:', err);
    return res.status(500).json({ error: 'Failed to fetch balance' });
  }
});

app.post('/api/player/cashout', auth, async (req, res) => {
  try {
    const v = await Voucher.findOne({ userCode: req.user.userCode }).exec();
    if (!v) return res.status(404).json({ error: 'Account not found' });
    const amount = v.balance || 0;
    v.balance = 0;
    await v.save();
    await Transaction.create({
      userCode: v.userCode, type: 'cashout', amount, balanceAfter: v.balance
    });
    return res.json({ ok: true, cashedOut: amount, balance: 0 });
  } catch (err) {
    console.error('cashout error:', err);
    return res.status(500).json({ error: 'Cashout failed' });
  }
});

// -------------------------------
// Game: spin (simple RNG stub for now)
// -------------------------------
app.post('/api/game/spin', auth, async (req, res) => {
  try {
    const bet = Number.parseFloat(req.body?.bet);
    if (!bet || bet <= 0) return res.status(400).json({ error: 'Invalid bet' });

    const v = await Voucher.findOne({ userCode: req.user.userCode }).exec();
    if (!v) return res.status(404).json({ error: 'Account not found' });
    if (v.balance < bet) return res.status(400).json({ error: 'Insufficient balance' });

    // Debit bet
    v.balance = Math.max(0, v.balance - bet);
    await Transaction.create({ userCode: v.userCode, type: 'bet', amount: bet, balanceAfter: v.balance });

    // Very simple RNG payout profile (tune later or replace with real game server)
    // ~35% small wins 2x, 10% mid 5x, 3% big 20x, otherwise 0
    const r = Math.random();
    let win = 0;
    if (r < 0.03) win = bet * 20;
    else if (r < 0.13) win = bet * 5;
    else if (r < 0.48) win = bet * 2;

    if (win > 0) {
      v.balance += Math.floor(win); // integerize if you want
      await Transaction.create({ userCode: v.userCode, type: 'win', amount: win, balanceAfter: v.balance });
    }

    await v.save();

    // You can shape a "reel result" payload here; for now send simple data
    return res.json({
      result: {
        bet,
        win,
        balance: v.balance,
        ts: Date.now(),
        // placeholder "stops" for a 3x3 reel UI (client can animate however it wants)
        stops: [
          Math.floor(Math.random() * 8),
          Math.floor(Math.random() * 8),
          Math.floor(Math.random() * 8)
        ]
      }
    });
  } catch (err) {
    console.error('spin error:', err);
    return res.status(500).json({ error: 'Spin failed' });
  }
});

// -------------------------------
// Start
// -------------------------------
(async () => {
  try {
    await connectMongo();
    app.listen(PORT, () => {
      console.log(`▶ PlaytimeUSA API listening on ${PORT}`);
    });
  } catch (err) {
    console.error('Fatal startup error:', err);
    process.exit(1);
  }
})();
