const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const dotenv = require("dotenv");
const jwt = require("jsonwebtoken");
const QRCode = require("qrcode");

const Voucher = require("./models/Voucher");
const Transaction = require("./models/Transaction");

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.DB_URI;
const JWT_SECRET = process.env.JWT_SECRET || "changeme";
const MAX_DB_CONNECT_ATTEMPTS = 10;

// Middleware
app.use(cors({ origin: "*" }));
app.use(express.json());

// ========================
// MongoDB Connection
// ========================
mongoose
  .connect(MONGO_URI)
  .then(() => console.log("✅ Connected to MongoDB Atlas"))
  .catch((err) => {
    console.error("❌ MongoDB connection error:", err.message);
const connectWithRetry = async (attempt = 1) => {
  if (!MONGO_URI) {
    console.error("❌ Missing DB_URI environment variable. Unable to connect to MongoDB.");
    process.exit(1);
  });
  }

  try {
    await mongoose.connect(MONGO_URI, {
      serverSelectionTimeoutMS: 5000
    });
    console.log("✅ Connected to MongoDB Atlas");
  } catch (err) {
    const delay = Math.min(30000, attempt * 2000);
    console.error(`❌ MongoDB connection attempt ${attempt} failed: ${err.message}`);

    if (attempt >= MAX_DB_CONNECT_ATTEMPTS) {
      console.error("❌ Maximum MongoDB connection attempts exceeded. Exiting.");
      process.exit(1);
    }

    console.log(`⏳ Retrying MongoDB connection in ${delay / 1000}s...`);
    setTimeout(() => connectWithRetry(attempt + 1), delay);
  }
};

if (process.env.NODE_ENV !== "test") {
  connectWithRetry();
}

const gracefulShutdown = async () => {
  console.log("🔻 Shutting down server...");
  await mongoose.connection.close();
  process.exit(0);
};

process.on("SIGINT", gracefulShutdown);
process.on("SIGTERM", gracefulShutdown);

// ========================
// Routes
// ========================

// Health check
app.get("/", (req, res) => {
  res.json({ message: "Casino backend is running 🚀" });
});

// Cashier: Create voucher
app.post("/api/cashier/voucher", async (req, res) => {
  try {
    const { amount } = req.body;
    if (!amount) return res.status(400).json({ error: "Missing amount" });

    const userCode = Math.floor(100000 + Math.random() * 900000).toString();
    const password = Math.floor(100000 + Math.random() * 900000).toString();
    const pin = Math.floor(100000 + Math.random() * 900000).toString();
    const bonus = Math.floor(amount * 0.5);
    const balance = amount + bonus;

    const voucher = await Voucher.create({ userCode, password, amount, bonus, balance });
    const voucher = await Voucher.create({ userCode, pin, amount, bonus, balance });

    await Transaction.create({
      type: "deposit",
      amount: balance,
      balanceAfter: balance,
      userCode
    });

    const loginUrl = `${process.env.FRONTEND_URL || "http://localhost:5173"}/login.html`;
    const qrCode = await QRCode.toDataURL(`${loginUrl}?user=${userCode}&pass=${password}`);
    const qrCode = await QRCode.toDataURL(`${loginUrl}?user=${userCode}&pass=${pin}`);

    res.json({ userCode, password, amount, bonus, balance, loginUrl, qrCode });
    res.json({ userCode, pin, amount, bonus, balance, loginUrl, qrCode });
  } catch (err) {
    console.error("Voucher error:", err);
    res.status(500).json({ error: "Failed to create voucher" });
  }
});

// Player: Login with voucher
app.post("/api/player/login", async (req, res) => {
  try {
    const { userCode, password } = req.body;
    const voucher = await Voucher.findOne({ userCode, password, isUsed: false });
    const { userCode, pin } = req.body;
    const voucher = await Voucher.findOne({ userCode, pin, isUsed: false });

    if (!voucher) return res.status(400).json({ error: "Invalid or already used voucher" });

    voucher.isUsed = true;
    await voucher.save();

    const token = jwt.sign({ id: voucher._id, role: "player" }, JWT_SECRET, { expiresIn: "12h" });

    res.json({ token, balance: voucher.balance });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ error: "Login failed" });
  }
});

// Game: Spin
app.post("/api/game/spin", async (req, res) => {
  try {
    const auth = req.headers.authorization;
    if (!auth) return res.status(401).json({ error: "Missing token" });
    const token = auth.split(" ")[1];
    const decoded = jwt.verify(token, JWT_SECRET);

    const voucher = await Voucher.findById(decoded.id);
    if (!voucher) return res.status(404).json({ error: "Player not found" });
@@ -175,29 +206,32 @@ app.get("/api/admin/financials/:userCode", async (req, res) => {
    { $group: { _id: null, total: { $sum: "$amount" } } }
  ]);
  const wins = await Transaction.aggregate([
    { $match: { type: "win", userCode } },
    { $group: { _id: null, total: { $sum: "$amount" } } }
  ]);

  res.json({
    userCode,
    deposits: deposits[0]?.total || 0,
    bets: bets[0]?.total || 0,
    wins: wins[0]?.total || 0,
    profit: (bets[0]?.total || 0) + (wins[0]?.total || 0)
  });
});

app.get("/api/admin/transactions/:userCode", async (req, res) => {
  const { userCode } = req.params;
  const txns = await Transaction.find({ userCode }).sort({ createdAt: -1 });
  res.json(txns);
});

// ========================
// Start Server
// ========================
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
if (process.env.NODE_ENV !== "test") {
  app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
  });
}

module.exports = app;
