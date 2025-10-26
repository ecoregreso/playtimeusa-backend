const { Parser } = require('json2csv');
const Transaction = require('../models/Transaction');

const sanitizeDate = (value, fallback) => {
  if (!value) return fallback;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid date value: ${value}`);
  }
  return date;
};

const resolveRange = (query) => {
  const fallbackStart = new Date('1970-01-01T00:00:00.000Z');
  const fallbackEnd = new Date();

  const from = sanitizeDate(query.from, fallbackStart);
  const to = sanitizeDate(query.to, fallbackEnd);

  if (from > to) {
    throw new Error('The "from" date must be earlier than the "to" date.');
  }

  return { from, to };
};

const toNumber = (value) => {
  if (value === null || value === undefined) return 0;
  const numeric = Number.parseFloat(value);
  return Number.isNaN(numeric) ? 0 : Number.parseFloat(numeric.toFixed(2));
};

exports.financials = async (req, res) => {
  try {
    const { from, to } = resolveRange(req.query);

    const rows = await Transaction.aggregate([
      { $match: { createdAt: { $gte: from, $lte: to } } },
      {
        $group: {
          _id: '$type',
          count: { $sum: 1 },
          totalAmount: { $sum: '$amount' },
          totalAfter: { $sum: '$balanceAfter' }
        }
      },
      { $sort: { totalAmount: -1 } }
    ]);

    const payload = rows.map((r) => ({
      type: r._id,
      count: r.count,
      totalAmount: toNumber(r.totalAmount),
      totalAfter: toNumber(r.totalAfter)
    }));

    res.json({ range: { from, to }, totals: payload, generatedAt: new Date() });
  } catch (error) {
    console.error('Financials report error:', error);
    res.status(400).json({ error: error.message || 'Unable to generate financial report.' });
  }
};

exports.gameStats = async (req, res) => {
  try {
    const { from, to } = resolveRange(req.query);
    // Derive basic game-like stats from transaction stream (spin/win)
    const rows = await Transaction.aggregate([
      { $match: { createdAt: { $gte: from, $lte: to }, type: { $in: ['spin', 'win'] } } },
      {
        $group: {
          _id: '$type',
          count: { $sum: 1 },
          totalAmount: { $sum: '$amount' }
        }
      }
    ]);
    res.json({ range: { from, to }, summary: rows, generatedAt: new Date() });
  } catch (error) {
    console.error('Game stats report error:', error);
    res.status(400).json({ error: error.message || 'Unable to generate game statistics.' });
  }
};

exports.playerActivity = async (req, res) => {
  try {
    const userCode = String(req.params.id || '').trim();
    if (!userCode) {
      return res.status(400).json({ error: 'A valid user code is required.' });
    }

    const transactions = await Transaction.find({ userCode })
      .sort({ createdAt: -1 })
      .limit(200)
      .lean();

    res.json({
      userCode,
      activity: transactions.map((t) => ({ type: t.type, occurredAt: t.createdAt, payload: t })),
      generatedAt: new Date()
    });
  } catch (error) {
    console.error('Player activity report error:', error);
    res.status(400).json({ error: error.message || 'Unable to fetch player activity.' });
  }
};

exports.exportPlayerCSV = async (req, res) => {
  try {
    const userCode = String(req.params.id || '').trim();
    if (!userCode) {
      return res.status(400).json({ error: 'A valid user code is required.' });
    }

    const transactions = await Transaction.find({ userCode }).sort({ createdAt: 1 }).lean();

    const rows = transactions.map((t) => ({
      recordType: t.type,
      occurredAt: t.createdAt,
      amount: toNumber(t.amount),
      afterBalance: toNumber(t.balanceAfter)
    }));

    const parser = new Parser({
      fields: ['recordType', 'occurredAt', 'amount', 'afterBalance'],
      defaultValue: ''
    });

    const csv = parser.parse(rows);

    res.header('Content-Type', 'text/csv');
    res.attachment(`player_${userCode}_activity.csv`);
    res.send(csv);
  } catch (error) {
    console.error('Player CSV export error:', error);
    res.status(400).json({ error: error.message || 'Unable to export player activity.' });
  }
};
