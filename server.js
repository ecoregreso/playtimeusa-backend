// server.js
require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const QRCode = require('qrcode');
const jwt = require('jsonwebtoken');
const path = require('path');

const app = express();

// ========================
// Middleware
// ========================
app.use(cors({ origin: '*' }));
app.use(express.json());

// ========================
// MongoDB Connection
// ========================
const mongoUri =
  process.env.DB_URI ||
  `mongodb+srv://${process.env.DB_USER}:${encodeURIComponent(process.env.DB_PASS)}@${process.env.DB_HOST}${process.env.DB_NAME}?retryWrites=true&w=majority`;

mongoose
  .connect(mongoUri)
  .then(() => console.log('✅ MongoDB connected'))
  .catch((err) => console.error('❌ MongoDB connection error:', err));

// ========================
// Models
// ========================
const VoucherSchema = new mongoose.Schema({
  code: { type: String, required: true, unique: true },
  pin: { type: String, required: true },
  balance: { type: Number, required: true, default: 0 },
  createdAt: { type: Date, default: Date.now },
});

const Voucher = mongoose.model('Voucher', VoucherSchema);

// ========================
// Voucher Routes
// ========================

// Create a voucher
app.post('/voucher', async (req, res) => {
  try {
    const { code, pin, balance } = req.body;
    if (!code || !pin) {
      return res.status(400).json({ error: 'Code and PIN required' });
    }
    const voucher = new Voucher({ code, pin, balance });
    await voucher.save();
    res.json({ success: true, voucher });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get voucher by code
app.get('/voucher/:code', async (req, res) => {
  try {
    const voucher = await Voucher.findOne({ code: req.params.code });
    if (!voucher) return res.status(404).json({ error: 'Voucher not found' });
    res.json(voucher);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ========================
// Login (Manual + QR)
// ========================

// Manual login
app.post('/login', async (req, res) => {
  try {
    const { code, pin } = req.body;
    const voucher = await Voucher.findOne({ code, pin });
    if (!voucher) return res.status(401).json({ error: 'Invalid login' });

    const token = jwt.sign({ code: voucher.code }, process.env.JWT_SECRET, {
      expiresIn: process.env.JWT_EXPIRES_IN || '7d',
    });

    res.json({ success: true, token, balance: voucher.balance });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Generate QR login link
app.get('/qr/:code', async (req, res) => {
  try {
    const { code } = req.params;
    const loginUrl = `${process.env.FRONTEND_URL}/qr-login?code=${code}`;

    const qr = await QRCode.toDataURL(loginUrl);
    res.json({ qr, loginUrl });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ========================
// Start Server
// ========================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
