const jwt = require('jsonwebtoken');
const Voucher = require('../models/Voucher');

const JWT_SECRET = process.env.JWT_SECRET || 'changeme';

const toNumber = (value) => Number.parseFloat(value);

exports.login = async (req, res) => {
  const { userCode, password } = req.body || {};
  if (!userCode || !password) {
    return res.status(400).json({ error: 'Missing credentials' });
  }

  try {
    const voucher = await Voucher.findOne({ userCode, password }).lean();
    if (!voucher) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    if (voucher.isUsed) {
      return res.status(400).json({ error: 'Voucher already used' });
    }

    await Voucher.updateOne({ _id: voucher._id }, { $set: { isUsed: true } });

    const balance = toNumber(voucher.balance);
    const token = jwt.sign(
      { role: 'player', userCode: voucher.userCode },
      JWT_SECRET,
      { expiresIn: '12h' }
    );

    res.json({ token, balance });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};

exports.loginWithToken = async (req, res) => {
  const { token } = req.body || {};
  if (!token) {
    return res.status(400).json({ error: 'Token required' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (decoded.role !== 'player') {
      return res.status(403).json({ error: 'Only players can access this route' });
    }

    const voucher = await Voucher.findOne({ userCode: decoded.userCode }).lean();
    if (!voucher) {
      return res.status(404).json({ error: 'Voucher not found' });
    }

    const balance = toNumber(voucher.balance);
    res.json({ token, balance });
  } catch (err) {
    console.error(err);
    res.status(401).json({ error: 'Invalid or expired token' });
  }
};
