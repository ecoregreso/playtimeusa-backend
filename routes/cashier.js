const express = require("express");
const Voucher = require("../models/Voucher");
const { parseFC, formatFC, makeChange } = require("../lib/funcoin");

const router = express.Router();

router.post("/voucher", async (req, res) => {
  try {
    const amountFunCents = parseFC(req.body);
    const doc = await Voucher.create({ amountFunCents });
    const coins = makeChange(amountFunCents);
    return res.status(200).json({
      id: doc._id,
      amountFunCents,
      amountFormatted: formatFC(amountFunCents),
      coins: coins.coins
    });
  } catch {
    return res.status(400).json({ error: "Invalid fun-coin amount" });
  }
});

module.exports = router;
