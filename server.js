const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const dotenv = require("dotenv");
const jwt = require("jsonwebtoken");
const QRCode = require("qrcode");

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.DB_URI;

// Middleware
app.use(cors({ origin: "*" })); // TODO: lock to your frontend domain in prod
app.use(express.json());

// ========================
// MongoDB Connection
// ========================
mongoose
  .connect(MONGO_URI)
  .then(() => console.log("✅ Connected to MongoDB Atlas"))
  .catch((err) => {
    console.error("❌ MongoDB connection error:", err.message);
    process.exit(1); // stop server if DB fails
  });

// ========================
// Example Routes
// ========================

// Health check
app.get("/", (req, res) => {
  res.json({ message: "Casino backend is running 🚀" });
});

// Voucher example
app.post("/voucher", (req, res) => {
  const { userId, amount } = req.body;
  if (!userId || !amount) {
    return res.status(400).json({ error: "Missing userId or amount" });
  }
  // Example only – replace with DB logic
  const voucherCode = Math.floor(100000 + Math.random() * 900000).toString();
  res.json({ success: true, code: voucherCode, userId, amount });
});

// QR login example
app.get("/qr-login/:userId", async (req, res) => {
  try {
    const token = jwt.sign({ userId: req.params.userId }, process.env.JWT_SECRET, {
      expiresIn: process.env.JWT_EXPIRES_IN,
    });

    const loginUrl = `${process.env.FRONTEND_URL}/qr-login?token=${token}`;
    const qrCodeDataURL = await QRCode.toDataURL(loginUrl);

    res.json({ loginUrl, qrCode: qrCodeDataURL });
  } catch (err) {
    res.status(500).json({ error: "Failed to generate QR login" });
  }
});

// ========================
// Start Server
// ========================
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
