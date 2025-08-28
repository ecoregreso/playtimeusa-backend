const jwt = require('jsonwebtoken');
const { Player } = require('../models');

// Existing login (User Code + PIN)
exports.login = async (req, res) => {
  const { userCode, pin } = req.body;
  if (!userCode || !pin) return res.status(400).json({ error: 'Missing credentials' });

  try {
    const player = await Player.findOne({ where: { username: userCode, pin } });
    if (!player) return res.status(401).json({ error: 'Invalid credentials' });

    res.json({
      playerId: player.id,
      username: player.username,
      mainBalance: player.mainBalance,
      bonusBalance: player.bonusBalance
    });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
};

// NEW: Token login for QR codes
exports.loginWithToken = async (req, res) => {
  const { token } = req.body;
  if (!token) return res.status(400).json({ error: 'Token required' });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const player = await Player.findByPk(decoded.playerId);

    if (!player) return res.status(404).json({ error: 'Player not found' });

    res.json({
      playerId: player.id,
      username: player.username,
      mainBalance: player.mainBalance,
      bonusBalance: player.bonusBalance
    });
  } catch (err) {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
};

