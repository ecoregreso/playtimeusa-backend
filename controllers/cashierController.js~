const QRCode = require('qrcode');
const { sequelize, Voucher, Transaction, Player } = require('../models');

const sanitizeBaseUrl = (url) => (url.endsWith('/') ? url.slice(0, -1) : url);
const FRONTEND_BASE_URL = sanitizeBaseUrl(
  process.env.FRONTEND_URL || process.env.PUBLIC_URL || 'http://localhost:3000'
);

const normaliseCurrency = (value) => Number.parseFloat(value);

exports.listVouchers = async (_req, res) => {
  try {
    const vouchers = await Voucher.findAll({
      order: [['createdAt', 'DESC']],
      limit: 25
    });

    const payload = vouchers.map((voucher) => {
      const data = voucher.get({ plain: true });
      return {
        ...data,
        amount: normaliseCurrency(data.amount),
        bonus: normaliseCurrency(data.bonus),
        balance: normaliseCurrency(data.balance)
      };
    });

    res.json(payload);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch vouchers', details: error.message });
  }
};

const generateCode = () => Math.floor(100000 + Math.random() * 900000).toString();

exports.createVoucher = async (req, res) => {
  const amount = Number.parseFloat(req.body.amount);

  if (!Number.isFinite(amount) || amount <= 0) {
    return res.status(400).json({ error: 'A valid amount greater than 0 is required.' });
  }

  const bonus = Number.parseFloat((amount * 0.5).toFixed(2));
  const totalBalance = Number.parseFloat((amount + bonus).toFixed(2));
  const userCode = generateCode();
  const password = generateCode();

  try {
    const voucher = await sequelize.transaction(async (transaction) => {
      const player = await Player.create(
        {
          username: userCode,
          pin: password,
          mainBalance: amount,
          bonusBalance: bonus,
          sessionActive: false
        },
        { transaction }
      );

      const createdVoucher = await Voucher.create(
        {
          playerId: player.id,
          userCode,
          password,
          amount,
          bonus,
          balance: totalBalance
        },
        { transaction }
      );

      await Transaction.create(
        {
          playerId: player.id,
          voucherId: createdVoucher.id,
          userCode,
          type: 'deposit',
          amount: totalBalance,
          beforeBalance: 0,
          afterBalance: totalBalance,
          metadata: { issuedBy: req.user?.username || 'cashier-portal' }
        },
        { transaction }
      );

      return createdVoucher;
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
