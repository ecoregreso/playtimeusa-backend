const { Op, fn, col, literal } = require('sequelize');
const { Parser } = require('json2csv');

const { Bet, Transaction, Player } = require('../models');

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

    const aggregates = await Transaction.findAll({
      attributes: [
        'type',
        [fn('COUNT', col('Transaction.id')), 'count'],
        [fn('SUM', col('amount')), 'totalAmount'],
        [fn('SUM', col('beforeBalance')), 'totalBefore'],
        [fn('SUM', col('afterBalance')), 'totalAfter']
      ],
      where: {
        createdAt: {
          [Op.between]: [from, to]
        }
      },
      group: ['type'],
      order: [[literal('totalAmount'), 'DESC']]
    });

    const payload = aggregates.map((row) => {
      const data = row.get({ plain: true });
      return {
        type: data.type,
        count: Number.parseInt(data.count, 10) || 0,
        totalAmount: toNumber(data.totalAmount),
        totalBefore: toNumber(data.totalBefore),
        totalAfter: toNumber(data.totalAfter)
      };
    });

    res.json({
      range: { from, to },
      totals: payload,
      generatedAt: new Date()
    });
  } catch (error) {
    console.error('Financials report error:', error);
    res.status(400).json({ error: error.message || 'Unable to generate financial report.' });
  }
};

exports.gameStats = async (req, res) => {
  try {
    const { from, to } = resolveRange(req.query);

    const stats = await Bet.findAll({
      attributes: [
        'gameId',
        [fn('COUNT', col('Bet.id')), 'betCount'],
        [fn('SUM', col('stake')), 'totalStaked'],
        [fn('SUM', col('payout')), 'totalPayout']
      ],
      where: {
        createdAt: {
          [Op.between]: [from, to]
        }
      },
      group: ['gameId'],
      order: [[literal('totalStaked'), 'DESC']],
      limit: 100
    });

    const payload = stats.map((row) => {
      const data = row.get({ plain: true });
      const totalStaked = toNumber(data.totalStaked);
      const totalPayout = toNumber(data.totalPayout);
      return {
        gameId: data.gameId,
        betCount: Number.parseInt(data.betCount, 10) || 0,
        totalStaked,
        totalPayout,
        net: Number.parseFloat((totalStaked - totalPayout).toFixed(2))
      };
    });

    res.json({
      range: { from, to },
      games: payload,
      generatedAt: new Date()
    });
  } catch (error) {
    console.error('Game stats report error:', error);
    res.status(400).json({ error: error.message || 'Unable to generate game statistics.' });
  }
};

exports.playerActivity = async (req, res) => {
  try {
    const playerId = Number.parseInt(req.params.id, 10);
    if (!Number.isInteger(playerId)) {
      return res.status(400).json({ error: 'A valid player id is required.' });
    }

    const player = await Player.findByPk(playerId);
    if (!player) {
      return res.status(404).json({ error: 'Player not found.' });
    }

    const [bets, transactions] = await Promise.all([
      Bet.findAll({
        where: { playerId },
        order: [['createdAt', 'DESC']],
        limit: 100
      }),
      Transaction.findAll({
        where: { playerId },
        order: [['createdAt', 'DESC']],
        limit: 100
      })
    ]);

    const combined = [
      ...bets.map((bet) => ({
        type: 'bet',
        occurredAt: bet.createdAt,
        payload: bet.get({ plain: true })
      })),
      ...transactions.map((transaction) => ({
        type: 'transaction',
        occurredAt: transaction.createdAt,
        payload: transaction.get({ plain: true })
      }))
    ]
      .sort((a, b) => new Date(b.occurredAt) - new Date(a.occurredAt))
      .slice(0, 200);

    res.json({
      player: {
        id: player.id,
        username: player.username
      },
      activity: combined,
      generatedAt: new Date()
    });
  } catch (error) {
    console.error('Player activity report error:', error);
    res.status(400).json({ error: error.message || 'Unable to fetch player activity.' });
  }
};

exports.exportPlayerCSV = async (req, res) => {
  try {
    const playerId = Number.parseInt(req.params.id, 10);
    if (!Number.isInteger(playerId)) {
      return res.status(400).json({ error: 'A valid player id is required.' });
    }

    const player = await Player.findByPk(playerId);
    if (!player) {
      return res.status(404).json({ error: 'Player not found.' });
    }

    const [bets, transactions] = await Promise.all([
      Bet.findAll({ where: { playerId } }),
      Transaction.findAll({ where: { playerId } })
    ]);

    const rows = [
      ...bets.map((bet) => ({
        recordType: 'bet',
        occurredAt: bet.createdAt,
        stake: toNumber(bet.stake),
        payout: toNumber(bet.payout),
        result: JSON.stringify(bet.result ?? {})
      })),
      ...transactions.map((transaction) => ({
        recordType: transaction.type,
        occurredAt: transaction.createdAt,
        amount: toNumber(transaction.amount),
        beforeBalance: toNumber(transaction.beforeBalance),
        afterBalance: toNumber(transaction.afterBalance),
        metadata: JSON.stringify(transaction.metadata ?? {})
      }))
    ].sort((a, b) => new Date(a.occurredAt) - new Date(b.occurredAt));

    const parser = new Parser({
      fields: [
        'recordType',
        'occurredAt',
        'stake',
        'payout',
        'result',
        'amount',
        'beforeBalance',
        'afterBalance',
        'metadata'
      ],
      defaultValue: ''
    });

    const csv = parser.parse(rows);

    res.header('Content-Type', 'text/csv');
    res.attachment(`player_${playerId}_activity.csv`);
    res.send(csv);
  } catch (error) {
    console.error('Player CSV export error:', error);
    res.status(400).json({ error: error.message || 'Unable to export player activity.' });
  }
};
