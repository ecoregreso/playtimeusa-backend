const QRCode = require('qrcode');

const Voucher = require('../models/Voucher');
const Transaction = require('../models/Transaction');

const sanitizeBaseUrl = (url) => (url.endsWith('/') ? url.slice(0, -1) : url);
const FRONTEND_BASE_URL = sanitizeBaseUrl(
  process.env.FRONTEND_URL || process.env.PUBLIC_URL || 'http://localhost:3000'
);

exports.listVouchers = async (_req, res) => {
  try {
    const vouchers = await Voucher.find().sort({ createdAt: -1 }).limit(25);
    res.json(vouchers);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch vouchers', details: error.message });
  }
};

exports.createVoucher = async (req, res) => {
  try {
    const amount = Number(req.body.amount);

    if (!amount || Number.isNaN(amount) || amount <= 0) {
      return res.status(400).json({ error: 'A valid amount greater than 0 is required.' });
    }

    const userCode = Math.floor(100000 + Math.random() * 900000).toString();
    const password = Math.floor(100000 + Math.random() * 900000).toString();
    const bonus = Math.round(amount * 0.5);
    const balance = amount + bonus;

    const voucher = await Voucher.create({
      userCode,
      password,
      amount,
      bonus,
      balance
    });

    await Transaction.create({
      type: 'deposit',
      amount: balance,
      balanceAfter: balance,
      userCode
    });

    const loginUrl = `${FRONTEND_BASE_URL}/login.html?user=${encodeURIComponent(
      userCode
    )}&pass=${encodeURIComponent(password)}`;
    const qrCode = await QRCode.toDataURL(loginUrl);

    res.status(201).json({
      voucherId: voucher.id,
      userCode,
      password,
      amount,
      bonus,
      balance,
      loginUrl,
      qrCode,
      createdAt: voucher.createdAt
    });
  } catch (error) {
    console.error('Voucher error:', error);
    res.status(500).json({ error: 'Failed to create voucher', details: error.message });
  }
};
