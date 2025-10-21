// server.js — PlaytimeUSA backend (production, multi-agent, zero-setup for agents)
// - Agents have email/password, login to get a token
// - Cashier routes require agent token and auto-tag vouchers with agentId
// - Players still use code+pin to login & spin (voucher carries agentId)
// - Minimal Agent Console at /agent (simple HTML to login + create vouchers)

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
const bcrypt = require('bcryptjs');

const app = express();
app.set('trust proxy', 1);

const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || 'production';
const JWT_SECRET = process.env.JWT_SECRET || 'CHANGE_THIS_IN_PROD';
const PROVISION_KEY = process.env.PROVISION_KEY || 'CHANGE_PROVISION_KEY';

const FRONTEND_URL = sanitizeBaseUrl(
  process.env.FRONTEND_URL || 'https://example.com'
);

// CORS allowlist (supports "*" to allow all)
const ALLOWED_ORIGINS = (process.env.CORS_ORIGINS || FRONTEND_URL)
  .split(',').map(s => s.trim()).filter(Boolean);
const ALLOW_ANY_ORIGIN = ALLOWED_ORIGINS.includes('*');

app.use(helmet({
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));
if (NODE_ENV === 'production') {
  app.use(helmet.hsts({ maxAge: 15552000 })); // ~180 days
}
app.use(compression());
app.use(express.json({ limit: '2mb' }));
app.use(morgan(NODE_ENV === 'production' ? 'combined' : 'dev'));
app.use(cors({
  origin(origin, cb) {
    if (!origin) return cb(null, true); // curl/postman
    if (ALLOW_ANY_ORIGIN) return cb(null, true);
    const ok = ALLOWED_ORIGINS.some(o => origin.startsWith(o));
    return cb(ok ? null : new Error('CORS blocked'), ok);
  },
  credentials: false
}));

app.get('/health', (_req, res) => res.json({ ok: true, ts: Date.now() }));

// -------------------------------
// Mongo
// -------------------------------
async function connectMongo() {
  const uri = process.env.MONGO_URI;
  if (!uri) {
    console.error('[DB] Missing MONGO_URI.');
    process.exit(1);
  }
  await mongoose.connect(uri);
  console.log('[DB] Connected to Mongo (Atlas).');
}

// -------------------------------
/* Models */
// -------------------------------
function safeRequire(p) { try { return require(p); } catch { return null; } }

let Agent = safeRequire('./models/Agent');
if (!Agent) {
  const agentSchema = new mongoose.Schema({
    email: { type: String, unique: true, index: true },
    name: String,
    passwordHash: String,
    allowedOrigins: { type: [String], default: [] }
  }, { timestamps: true });
  Agent = mongoose.model('Agent', agentSchema);
}

let Voucher = safeRequire('./models/Voucher');
if (!Voucher) {
  const voucherSchema = new mongoose.Schema({
    agentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Agent', index: true },
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
    agentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Agent', index: true },
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
function signPlayerToken(userCode) {
  return jwt.sign({ sub: userCode, role: 'player' }, JWT_SECRET, { expiresIn: '7d' });
}
function signAgentToken(agent) {
  return jwt.sign({ sub: String(agent._id), role: 'agent', email: agent.email }, JWT_SECRET, { expiresIn: '14d' });
}
function authPlayer(req, res, next) {
  const token = (req.headers.authorization || '').replace(/^Bearer /, '');
  if (!token) return res.status(401).json({ error: 'Missing token' });
  try {
    const p = jwt.verify(token, JWT_SECRET);
    if (p.role !== 'player') return res.status(401).json({ error: 'Wrong token type' });
    req.player = { userCode: p.sub };
    next();
  } catch { return res.status(401).json({ error: 'Invalid token' }); }
}
function authAgent(req, res, next) {
  const token = (req.headers.authorization || '').replace(/^Bearer /, '');
  if (!token) return res.status(401).json({ error: 'Missing agent token' });
  try {
    const p = jwt.verify(token, JWT_SECRET);
    if (p.role !== 'agent') return res.status(401).json({ error: 'Wrong token type' });
    req.agent = { id: p.sub, email: p.email };
    next();
  } catch { return res.status(401).json({ error: 'Invalid agent token' }); }
}

// rate limits
const apiLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 600 });
const loginLimiter = rateLimit({ windowMs: 10 * 60 * 1000, max: 60 });
app.use('/api', apiLimiter);

// -------------------------------
// Provisioning (owner-only)
// -------------------------------
app.post('/api/provision/agent', async (req, res) => {
  try {
    const key = req.headers['x-provision-key'];
    if (!key || key !== PROVISION_KEY) return res.status(403).json({ error: 'Forbidden' });
    const { email, name, password, allowedOrigins = [] } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: 'Missing email or password' });

    const exists = await Agent.findOne({ email }).lean();
    if (exists) return res.status(409).json({ error: 'Agent already exists' });

    const passwordHash = await bcrypt.hash(String(password), 10);
    const agent = await Agent.create({ email, name: name || email, passwordHash, allowedOrigins });

    return res.json({
      ok: true,
      agent: { id: agent._id, email: agent.email, name: agent.name, allowedOrigins }
    });
  } catch (e) {
    console.error('provision agent error:', e);
    res.status(500).json({ error: 'Failed to provision agent' });
  }
});

// -------------------------------
// Agent auth
// -------------------------------
app.post('/api/agent/login', loginLimiter, async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: 'Missing credentials' });
    const agent = await Agent.findOne({ email }).exec();
    if (!agent) return res.status(401).json({ error: 'Invalid email or password' });

    const ok = await bcrypt.compare(String(password), agent.passwordHash);
    if (!ok) return res.status(401).json({ error: 'Invalid email or password' });

    const token = signAgentToken(agent);
    res.json({ token, agent: { id: agent._id, email: agent.email, name: agent.name } });
  } catch (e) {
    console.error('agent login error:', e);
    res.status(500).json({ error: 'Login failed' });
  }
});

app.get('/api/agent/me', authAgent, async (req, res) => {
  const agent = await Agent.findById(req.agent.id).lean();
  if (!agent) return res.status(404).json({ error: 'Agent not found' });
  res.json({ id: agent._id, email: agent.email, name: agent.name, allowedOrigins: agent.allowedOrigins });
});

// -------------------------------
// Cashier (agent-protected)
// -------------------------------
app.post('/api/cashier/voucher', authAgent, async (req, res) => {
  try {
    const amount = Number.parseFloat(req.body?.amount);
    if (!Number.isFinite(amount) || amount <= 0) return res.status(400).json({ error: 'Invalid amount' });

    const bonus = Math.round(amount * 0.5);
    const balance = amount + bonus;

    const userCode = await generateUniqueUserCode();
    const password = sixDigits();

    const voucher = await Voucher.create({
      agentId: req.agent.id,
      userCode, password,
      amount, bonus, balance,
      isUsed: false
    });

    await Transaction.create({
      agentId: req.agent.id,
      userCode, type: 'deposit',
      amount: balance, balanceAfter: balance,
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

app.get('/api/cashier/vouchers', authAgent, async (req, res) => {
  try {
    const list = await Voucher.find({ agentId: req.agent.id }).sort({ createdAt: -1 }).limit(100).lean();
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
// Player (unchanged: code+pin → token; voucher enforces agent linkage)
// -------------------------------
app.post('/api/player/login', loginLimiter, async (req, res) => {
  try {
    const { userCode, password } = req.body || {};
    if (!userCode || !password) return res.status(400).json({ error: 'Missing credentials' });
    const v = await Voucher.findOne({ userCode }).exec();
    if (!v || v.password !== String(password)) return res.status(401).json({ error: 'Invalid code or pin' });
    v.lastLoginAt = new Date();
    await v.save();
    res.json({ token: signPlayerToken(userCode), user: { userCode, balance: v.balance } });
  } catch (e) {
    console.error('player login error:', e);
    res.status(500).json({ error: 'Login failed' });
  }
});

app.get('/api/player/balance', authPlayer, async (req, res) => {
  try {
    const v = await Voucher.findOne({ userCode: req.player.userCode }).lean();
    if (!v) return res.status(404).json({ error: 'Account not found' });
    res.json({ userCode: v.userCode, balance: v.balance });
  } catch (e) {
    console.error('balance error:', e);
    res.status(500).json({ error: 'Failed to fetch balance' });
  }
});

app.post('/api/player/cashout', authPlayer, async (req, res) => {
  try {
    const v = await Voucher.findOne({ userCode: req.player.userCode }).exec();
    if (!v) return res.status(404).json({ error: 'Account not found' });
    const amount = v.balance || 0;
    v.balance = 0;
    await v.save();
    await Transaction.create({ agentId: v.agentId, userCode: v.userCode, type: 'cashout', amount, balanceAfter: v.balance });
    res.json({ ok: true, cashedOut: amount, balance: 0 });
  } catch (e) {
    console.error('cashout error:', e);
    res.status(500).json({ error: 'Cashout failed' });
  }
});

// -------------------------------
// Game
// -------------------------------
app.post('/api/game/spin', authPlayer, async (req, res) => {
  try {
    const bet = Number.parseFloat(req.body?.bet);
    if (!Number.isFinite(bet) || bet <= 0) return res.status(400).json({ error: 'Invalid bet' });

    const v = await Voucher.findOne({ userCode: req.player.userCode }).exec();
    if (!v) return res.status(404).json({ error: 'Account not found' });
    if (v.balance < bet) return res.status(400).json({ error: 'Insufficient balance' });

    // debit bet
    v.balance = Math.max(0, v.balance - bet);
    await Transaction.create({ agentId: v.agentId, userCode: v.userCode, type: 'bet', amount: bet, balanceAfter: v.balance });

    // simple payout profile
    const r = Math.random();
    let win = 0;
    if (r < 0.03) win = bet * 20;
    else if (r < 0.13) win = bet * 5;
    else if (r < 0.48) win = bet * 2;

    if (win > 0) {
      v.balance += Math.floor(win);
      await Transaction.create({ agentId: v.agentId, userCode: v.userCode, type: 'win', amount: win, balanceAfter: v.balance });
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
// Tiny Agent Console (zero setup UI)
// -------------------------------
app.get('/agent', (_req, res) => {
  res.type('html').send(`<!doctype html>
<meta name=viewport content="width=device-width,initial-scale=1" />
<title>Agent Console</title>
<style>body{font-family:system-ui,Arial,sans-serif;max-width:540px;margin:40px auto;padding:0 16px}input,button{font-size:16px;padding:8px;margin:4px 0;width:100%}code{background:#f5f5f5;padding:2px 4px;border-radius:4px}</style>
<h1>Agent Console</h1>
<p>Login then create vouchers.</p>
<section id="login">
  <h3>Login</h3>
  <input id="email" placeholder="email" />
  <input id="pw" placeholder="password" type="password" />
  <button onclick="login()">Login</button>
  <pre id="loginMsg"></pre>
</section>
<section id="cashier" style="display:none">
  <h3>Create Voucher</h3>
  <input id="amount" type="number" placeholder="Amount (e.g., 100)" />
  <button onclick="createVoucher()">Create</button>
  <pre id="voucherOut"></pre>
  <h3>Recent Vouchers</h3>
  <button onclick="listVouchers()">Refresh</button>
  <pre id="listOut"></pre>
</section>
<script>
let agentToken=null;
async function req(path, opts={}) {
  const h={ 'Content-Type':'application/json', ...(agentToken?{Authorization:'Bearer '+agentToken}:{}) };
  const r = await fetch(path, {...opts, headers:h});
  const t = await r.text();
  try{ return { ok:r.ok, data: JSON.parse(t)} }catch{ return { ok:r.ok, data: t } }
}
async function login(){
  const email=document.getElementById('email').value.trim();
  const password=document.getElementById('pw').value.trim();
  const {ok,data}=await req('/api/agent/login',{method:'POST',body:JSON.stringify({email,password})});
  document.getElementById('loginMsg').textContent = JSON.stringify(data,null,2);
  if(ok&&data.token){ agentToken=data.token; document.getElementById('cashier').style.display='block'; }
}
async function createVoucher(){
  const amount=Number(document.getElementById('amount').value);
  const {ok,data}=await req('/api/cashier/voucher',{method:'POST',body:JSON.stringify({amount})});
  document.getElementById('voucherOut').textContent = JSON.stringify(data,null,2);
}
async function listVouchers(){
  const {ok,data}=await req('/api/cashier/vouchers');
  document.getElementById('listOut').textContent = JSON.stringify(data,null,2);
}
</script>`);
});

// -------------------------------
// Start
// -------------------------------
process.on('unhandledRejection', err => console.error('UNHANDLED REJECTION:', err));
process.on('uncaughtException', err => { console.error('UNCAUGHT EXCEPTION:', err); process.exit(1); });

(async () => {
  try {
    await connectMongo();
    app.listen(PORT, () => console.log(`▶ PlaytimeUSA API listening on ${PORT}`));
  } catch (e) {
    console.error('Fatal startup error:', e);
    process.exit(1);
  }
})();
