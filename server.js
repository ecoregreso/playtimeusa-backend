const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');
const jwt = require('jsonwebtoken');
const path = require('path');

dotenv.config();

const Voucher = require('./models/Voucher');
const Transaction = require('./models/Transaction');
const cashierRoutes = require('./routes/cashierRoutes');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'changeme';

const sanitizeBaseUrl = (url) => (url.endsWith('/') ? url.slice(0, -1) : url);
const FRONTEND_BASE_URL = sanitizeBaseUrl(
  process.env.FRONTEND_URL || process.env.PUBLIC_URL || `http://localhost:${PORT}`
);

app.use(cors({ origin: '*' }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

let memoryServer;

const connectDatabase = async () => {
  let mongoUri = process.env.DB_URI;
  const useInMemory = process.env.USE_IN_MEMORY_DB === 'true';

  if (!mongoUri && useInMemory) {
    try {
      const { MongoMemoryServer } = require('mongodb-memory-server');
      memoryServer = await MongoMemoryServer.create();
      mongoUri = memoryServer.getUri();
      console.log(`🧪 Started in-memory MongoDB at ${mongoUri}`);
    } catch (error) {
      console.error('❌ Unable to launch in-memory MongoDB:', error.message);
      throw error;
    }
  }

  if (!mongoUri) {
    mongoUri = 'mongodb://127.0.0.1:27017/playtimeusa';
    console.log(`ℹ️ Using default MongoDB URI ${mongoUri}`);
  }

  try {
    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB');
  } catch (err) {
    console.error('❌ MongoDB connection error:', err.message);
    throw err;
  }
};

app.use('/api/cashier', cashierRoutes);

app.get('/', (req, res) => {
  if (req.accepts('html')) {
    return res.sendFile(path.join(__dirname, 'public', 'cashier.html'));
  }
  res.json({ message: 'Casino backend is running 🚀' });
});

app.post('/api/player/login', async (req, res) => {
  try {
    const { userCode, password } = req.body;
    const voucher = await Voucher.findOne({ userCode, password, isUsed: false });

    if (!voucher) return res.status(400).json({ error: 'Invalid or already used voucher' });

    voucher.isUsed = true;
    await voucher.save();

    const token = jwt.sign({ id: voucher._id, role: 'player' }, JWT_SECRET, { expiresIn: '12h' });

    res.json({ token, balance: voucher.balance });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Login failed' });
  }
});

app.post('/api/game/spin', async (req, res) => {
  try {
    const auth = req.headers.authorization;
    if (!auth) return res.status(401).json({ error: 'Missing token' });
    const token = auth.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET);

    const voucher = await Voucher.findById(decoded.id);
    if (!voucher) return res.status(404).json({ error: 'Player not found' });

    const { bet } = req.body;
    if (!bet || bet <= 0) return res.status(400).json({ error: 'Invalid bet' });
    if (voucher.balance < bet) return res.status(400).json({ error: 'Insufficient balance' });

    voucher.balance -= bet;

    const win = Math.random() < 0.5 ? bet * 2 : 0;
    voucher.balance += win;
    await voucher.save();

    await Transaction.create({
      type: 'spin',
      amount: -bet,
      balanceAfter: voucher.balance,
      userCode: voucher.userCode
    });

    if (win > 0) {
      await Transaction.create({
        type: 'win',
        amount: win,
        balanceAfter: voucher.balance,
        userCode: voucher.userCode
      });
    }

    res.json({ result: win > 0 ? 'WIN' : 'LOSE', win, balance: voucher.balance });
  } catch (err) {
    console.error('Spin error:', err);
    res.status(500).json({ error: 'Game spin failed' });
  }
});

app.get('/api/admin/transactions', async (_req, res) => {
  const txns = await Transaction.find().sort({ createdAt: -1 });
  res.json(txns);
});

app.get('/api/admin/financials', async (_req, res) => {
  const deposits = await Transaction.aggregate([
    { $match: { type: 'deposit' } },
    { $group: { _id: null, total: { $sum: '$amount' } } }
  ]);
  const bets = await Transaction.aggregate([
    { $match: { type: 'spin' } },
    { $group: { _id: null, total: { $sum: '$amount' } } }
  ]);
  const wins = await Transaction.aggregate([
    { $match: { type: 'win' } },
    { $group: { _id: null, total: { $sum: '$amount' } } }
  ]);

  res.json({
    deposits: deposits[0]?.total || 0,
    bets: bets[0]?.total || 0,
    wins: wins[0]?.total || 0,
    profit: (bets[0]?.total || 0) + (wins[0]?.total || 0)
  });
});

app.get('/api/admin/financials/:userCode', async (req, res) => {
  const { userCode } = req.params;

  const deposits = await Transaction.aggregate([
    { $match: { type: 'deposit', userCode } },
    { $group: { _id: null, total: { $sum: '$amount' } } }
  ]);
  const bets = await Transaction.aggregate([
    { $match: { type: 'spin', userCode } },
    { $group: { _id: null, total: { $sum: '$amount' } } }
  ]);
  const wins = await Transaction.aggregate([
    { $match: { type: 'win', userCode } },
    { $group: { _id: null, total: { $sum: '$amount' } } }
  ]);

  res.json({
    userCode,
    deposits: deposits[0]?.total || 0,
    bets: bets[0]?.total || 0,
    wins: wins[0]?.total || 0,
    profit: (bets[0]?.total || 0) + (wins[0]?.total || 0)
  });
});

app.get('/api/admin/transactions/:userCode', async (req, res) => {
  const { userCode } = req.params;
  const txns = await Transaction.find({ userCode }).sort({ createdAt: -1 });
  res.json(txns);
});

app.get('/cashier', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'cashier.html'));
});

app.get('/login', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

let server;

const startServer = async () => {
  try {
    await connectDatabase();
    server = app.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
      console.log(`💳 Cashier portal: ${FRONTEND_BASE_URL}/cashier.html`);
    });
  } catch (error) {
    console.error('❌ Server startup failed due to database error.');
    process.exit(1);
  }
};

startServer();

const gracefulShutdown = async (signal) => {
  console.log(`\n${signal} received. Closing server...`);
  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }
  await mongoose.connection.close().catch(() => {});
  if (memoryServer) {
    await memoryServer.stop();
  }
  process.exit(0);
};

['SIGINT', 'SIGTERM'].forEach((signal) => {
  process.on(signal, () => gracefulShutdown(signal));
});
