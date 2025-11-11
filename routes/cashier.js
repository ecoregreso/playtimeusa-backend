const express = require('express');
const Voucher = require('../models/Voucher');
const { parseFC, formatFC, makeChange } = require('../lib/funcoin');

const router = express.Router();

router.post('/voucher', async (req, res) => {
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
    return res.status(400).json({ error: 'Invalid fun-coin amount', code: 400 });
  }
});

router.get('/voucher/:id', async (req, res) => {
  const doc = await Voucher.findById(req.params.id).lean();
  if (!doc) return res.status(404).json({ error: 'not_found', code: 404 });
  res.json(doc);
});

router.get('/vouchers', async (req, res) => {
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 25));
  const cursor = req.query.cursor ? { _id: { $lt: req.query.cursor } } : {};
  const rows = await Voucher.find(cursor).sort({ _id: -1 }).limit(limit).lean();
  const nextCursor = rows.length === limit ? rows[rows.length - 1]._id : null;
  res.json({ rows, nextCursor });
});

module.exports = router;
