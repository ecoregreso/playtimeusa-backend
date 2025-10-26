// controllers/cashierController.js — Mongoose version for fast voucher flow
const QRCode = require('qrcode');
const Voucher = require('../models/Voucher');
const Transaction = require('../models/Transaction');

const sanitizeBaseUrl = (url) => (url && url.endsWith('/') ? url.slice(0, -1) : url || '');
const FRONTEND_BASE_URL = sanitizeBaseUrl(
  process.env.FRONTEND_URL || process.env.PUBLIC_URL || 'http://localhost:3000'
);

// simple 6-digit codes
function sixDigits() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

async function generateUniqueUserCode() {
  let code;
  for (let i = 0; i < 10; i++) {
    code = sixDigits();
    const exists = await Voucher.findOne({ userCode: code }).lean();
    if (!exists) return code;
  }
  // fallback with a suffix if collisions are absurdly unlucky
  return sixDigits() + Math.floor(Math.random() * 10).toString();
}

const toNumber = (v) => Number.parseFloat(v);

exports.listVouchers = async (_req, res) => {
  try {
    const vouchers = await Voucher.find().sort({ createdAt: -1 }).limit(25).lean();
    res.json(
      vouchers.map((v) => ({
        userCode: v.userCode,
        balance: v.balance,
        amount: v.amount,
        bonus: v.bonus,
        isUsed: v.isUsed,
        createdAt: v.createdAt
      }))
    );
  } catch (err) {
    console.error('listVouchers error:', err);
    res.status(500).json({ error: 'Failed to list vouchers' });
  }
};

exports.createVoucher = async (req, res) => {
  try {
    const rawAmount = req.body?.amount;
    const amount = toNumber(rawAmount);
    if (!amount || amount <= 0) {
      return res.status(400).json({ error: 'Invalid amount' });
    }

    // 50% deposit bonus rule
    const bonus = Math.round(amount * 0.5);
    const totalBalance = amount + bonus;

    const userCode = await generateUniqueUserCode();
    const password = sixDigits();

    const voucher = await Voucher.create({
      userCode,
      password,
      amount,
      bonus,
      balance: totalBalance,
      isUsed: false
    });

    // Optional: record a deposit transaction
    await Transaction.create({
      type: 'deposit',
      amount: totalBalance,
      balanceAfter: totalBalance,
      userCode
    });

    const loginUrl = `${FRONTEND_BASE_URL}/login.html?user=${encodeURIComponent(
      userCode
    )}&pass=${encodeURIComponent(password)}`;

    const qrCode = await QRCode.toDataURL(loginUrl);

    res.json({
      userCode,
      password,
      amount,
      bonus,
      balance: totalBalance,
      loginUrl,
      qrCode,
      createdAt: voucher.createdAt
    });
  } catch (error) {
    console.error('Voucher error:', error);
    res.status(500).json({ error: 'Failed to create voucher', details: error.message });
  }
};
