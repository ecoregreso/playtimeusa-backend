const express = require("express");
const router = express.Router();
const { requirePlayerAuth } = require("../middleware/authPlayer");
const { Player, Transaction } = require("../models");

// Basic slot payout table
const symbols = ["🍒", "🍋", "🔔", "⭐", "7️⃣"];
const payoutTable = {
  "🍒🍒🍒": 10,
  "🍋🍋🍋": 20,
  "🔔🔔🔔": 50,
  "⭐⭐⭐": 100,
  "7️⃣7️⃣7️⃣": 500
};

router.post("/spin", requirePlayerAuth, async (req, res) => {
  const bet = parseInt(req.body.bet) || 1;
  const playerId = req.user.id;

  try {
    const player = await Player.findByPk(playerId);
    if (!player || player.balance < bet) {
      return res.status(400).json({ error: "Insufficient balance" });
    }

    // Deduct bet
    player.balance -= bet;

    // Spin reels
    const reels = [
      symbols[Math.floor(Math.random() * symbols.length)],
      symbols[Math.floor(Math.random() * symbols.length)],
      symbols[Math.floor(Math.random() * symbols.length)]
    ];
    const outcome = reels.join("");

    // Check winnings
    const winAmount = payoutTable[outcome] || 0;
    player.balance += winAmount;

    await player.save();

    // Log transaction
    await Transaction.create({
      playerId,
      type: "spin",
      amount: bet,
      result: outcome,
      payout: winAmount
    });

    res.json({
      reels,
      outcome,
      winAmount,
      balance: player.balance
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Game error" });
  }
});

module.exports = router;

