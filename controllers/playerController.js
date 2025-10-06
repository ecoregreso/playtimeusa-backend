const jwt = require('jsonwebtoken');
const { sequelize, Player, Voucher } = require('../models');

const JWT_SECRET = process.env.JWT_SECRET || 'changeme';

const toNumber = (value) => Number.parseFloat(value);

exports.login = async (req, res) => {
  const { userCode, password } = req.body;
  if (!userCode || !password) {
    return res.status(400).json({ error: 'Missing credentials' });
  }

  try {
    const voucher = await Voucher.findOne({ where: { userCode, password } });
    if (!voucher) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    if (voucher.isUsed) {
      return res.status(400).json({ error: 'Voucher already used' });
    }

    const player = await Player.findByPk(voucher.playerId);
    if (!player) {
      return res.status(404).json({ error: 'Player profile not found' });
    }

    await sequelize.transaction(async (transaction) => {
      voucher.isUsed = true;
      await voucher.save({ transaction });

      player.sessionActive = true;
      await player.save({ transaction });
    });

    const balance = toNumber(voucher.balance);
    const token = jwt.sign(
      { id: player.id, role: 'player', voucherId: voucher.id, userCode: voucher.userCode },
      JWT_SECRET,
      { expiresIn: '12h' }
    );

    res.json({
      token,
      balance,
      mainBalance: toNumber(player.mainBalance),
      bonusBalance: toNumber(player.bonusBalance)
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};

exports.loginWithToken = async (req, res) => {
  const { token } = req.body;
  if (!token) {
    return res.status(400).json({ error: 'Token required' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (decoded.role !== 'player') {
      return res.status(403).json({ error: 'Only players can access this route' });
    }

    const player = await Player.findByPk(decoded.id);
    const voucher = decoded.voucherId ? await Voucher.findByPk(decoded.voucherId) : null;

    if (!player) {
      return res.status(404).json({ error: 'Player not found' });
    }

    const balance = voucher
      ? toNumber(voucher.balance)
      : toNumber(player.mainBalance) + toNumber(player.bonusBalance);

    res.json({
      token,
      balance,
      mainBalance: toNumber(player.mainBalance),
      bonusBalance: toNumber(player.bonusBalance)
    });
  } catch (err) {
    console.error(err);
    res.status(401).json({ error: 'Invalid or expired token' });
  }
};
