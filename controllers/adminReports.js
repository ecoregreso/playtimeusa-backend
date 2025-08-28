const sequelize = require('../config/database');
const Bet = require('../models/Bet');
const Transaction = require('../models/Transaction');
const { Parser } = require('json2csv');

exports.financials = async (req,res)=> {
  try{
    const from = req.query.from || '1970-01-01';
    const to = req.query.to || new Date().toISOString();
    const sql = `SELECT type, SUM(amount::numeric) as total, COUNT(*) as cnt FROM "Transactions" WHERE "createdAt" BETWEEN :from AND :to GROUP BY type;`;
    const rows = await sequelize.query(sql, { replacements:{from,to}, type: sequelize.QueryTypes.SELECT });
    res.json(rows);
  }catch(e){ console.error(e); res.status(500).json({error:'server'}); }
};

exports.gameStats = async (req,res)=> {
  try{
    const from = req.query.from || '1970-01-01';
    const to = req.query.to || new Date().toISOString();
    const sql = `SELECT b."gameId", COUNT(b.id) as bet_count, SUM(b.stake::numeric) as total_staked, SUM(b.payout::numeric) as total_payout FROM "Bets" b WHERE b."createdAt" BETWEEN :from AND :to GROUP BY b."gameId" ORDER BY total_staked DESC LIMIT 100;`;
    const rows = await sequelize.query(sql, { replacements:{from,to}, type: sequelize.QueryTypes.SELECT });
    res.json(rows);
  }catch(e){ console.error(e); res.status(500).json({error:'server'}); }
};

exports.playerActivity = async (req,res)=> {
  try{
    const playerId = req.params.id;
    const bets = await Bet.findAll({ where:{ playerId }, order:[['createdAt','DESC']], limit:100 });
    const txs = await Transaction.findAll({ where:{ playerId }, order:[['createdAt','DESC']], limit:100 });
    const merged = [];
    bets.forEach(b=> merged.push({ type:'bet', time:b.createdAt, data:b }));
    txs.forEach(t=> merged.push({ type:'tx', time:t.createdAt, data:t }));
    merged.sort((a,b)=> new Date(b.time)-new Date(a.time));
    res.json(merged.slice(0,200));
  }catch(e){ console.error(e); res.status(500).json({error:'server'}); }
};

exports.exportPlayerCSV = async (req,res)=> {
  try{
    const playerId = req.params.id;
    const bets = await Bet.findAll({ where:{ playerId }});
    const txs = await Transaction.findAll({ where:{ playerId }});
    const rows = [];
    bets.forEach(b=> rows.push({ type:'bet', time:b.createdAt, stake:b.stake, payout:b.payout }));
    txs.forEach(t=> rows.push({ type:t.type, time:t.createdAt, amount:t.amount, before:t.beforeBalance, after:t.afterBalance }));
    const parser = new Parser();
    const csv = parser.parse(rows);
    res.header('Content-Type','text/csv');
    res.attachment(`player_${playerId}_activity.csv`);
    res.send(csv);
  }catch(e){ console.error(e); res.status(500).json({error:'server'}); }
};
