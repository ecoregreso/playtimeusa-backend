const jwt = require('jsonwebtoken');
const { Player } = require('../models');
const QRCode = require('qrcode');

exports.createVoucher = async (req, res) => {
  const { amount } = req.body;
  if (!amount) return res.status(400).json({ error: 'Amount required' });

  // Generate random credentials
  const userCode = Math.floor(100000 + Math.random() * 900000).toString();
  const pin = Math.floor(100000 + Math.random() * 900000).toString();

  // Create player in DB
  const player = await Player.create({
    username: userCode,
    pin: pin,
    mainBalance: amount,
    bonusBalance: (amount * 0.5).toFixed(2),
  });

  // Generate JWT token for QR auto-login
  const token = jwt.sign(
    { playerId: player.id, oneTime: true },
    process.env.JWT_SECRET,
    { expiresIn: '2h' }
  );

  const loginUrl = `${process.env.FRONTEND_URL}/login.html?token=${token}`;
  const qrCode = await QRCode.toDataURL(loginUrl);

  res.json({
    userCode,
    pin,
    amount,
    bonus: player.bonusBalance,
    loginUrl,
    qrCode
  });
};

