const express = require('express');
const router = express.Router();
const { requirePlayerAuth } = require('../middleware/authPlayer');
const { Player, Transaction } = require('../models');

const symbols = ['🍒', '🍋', '🔔', '⭐', '7️⃣'];
const payoutTable = {
  '🍒🍒🍒': 10,
  '🍋🍋🍋': 20,
  '🔔🔔🔔': 50,
  '⭐⭐⭐': 100,
  '7️⃣7️⃣7️⃣': 500
};

const totalBalanceOf = (player) =>
  Number.parseFloat(player.mainBalance) + Number.parseFloat(player.bonusBalance);

router.post('/spin', requirePlayerAuth, async (req, res) => {
  const bet = Number.parseInt(req.body.bet, 10) || 1;
  const playerId = req.user.id;

  try {
    const player = await Player.findByPk(playerId);
    if (!player) {
      return res.status(404).json({ error: 'Player not found' });
    }

    const beforeBalance = totalBalanceOf(player);
    if (beforeBalance < bet) {
      return res.status(400).json({ error: 'Insufficient balance' });
    }

    const reels = [
      symbols[Math.floor(Math.random() * symbols.length)],
      symbols[Math.floor(Math.random() * symbols.length)],
      symbols[Math.floor(Math.random() * symbols.length)]
    ];
    const outcome = reels.join('');

    const winAmount = payoutTable[outcome] || 0;
    const netChange = winAmount - bet;
    const updatedBalance = Number.parseFloat((beforeBalance + netChange).toFixed(2));

    const mainBalance = Number.parseFloat(player.mainBalance);
    const bonusBalance = Number.parseFloat(player.bonusBalance);
    let remainingChange = -bet;

    let newMain = mainBalance;
    let newBonus = bonusBalance;

    if (remainingChange < 0) {
      const appliedFromMain = Math.min(newMain, Math.abs(remainingChange));
      newMain = Number.parseFloat((newMain - appliedFromMain).toFixed(2));
      remainingChange += appliedFromMain;

      if (remainingChange < 0) {
        const appliedFromBonus = Math.min(newBonus, Math.abs(remainingChange));
        newBonus = Number.parseFloat((newBonus - appliedFromBonus).toFixed(2));
        remainingChange += appliedFromBonus;
      }
    }

    if (winAmount > 0) {
      newMain = Number.parseFloat((newMain + winAmount).toFixed(2));
    }

    player.mainBalance = newMain;
    player.bonusBalance = newBonus;
    await player.save();

    await Transaction.create({
      playerId,
      voucherId: req.user.voucherId || null,
      userCode: req.user.userCode,
      type: 'spin',
      amount: bet,
      beforeBalance,
      afterBalance: updatedBalance,
      metadata: { reels, outcome, winAmount }
    });

    if (winAmount > 0) {
      await Transaction.create({
        playerId,
        voucherId: req.user.voucherId || null,
        userCode: req.user.userCode,
        type: 'win',
        amount: winAmount,
        beforeBalance: updatedBalance - winAmount,
        afterBalance: updatedBalance,
        metadata: { outcome }
      });
    }

    res.json({ reels, outcome, winAmount, balance: updatedBalance });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Game error' });
  }
});

module.exports = router;
