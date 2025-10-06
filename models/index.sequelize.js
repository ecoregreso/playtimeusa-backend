const sequelize = require('../config/database');
const Player = require('./Player');
const Voucher = require('./Voucher');
const Transaction = require('./Transaction');
const Bet = require('./Bet');
const initGame = require('./Game');

const Game = initGame(sequelize);

Player.hasMany(Voucher, { foreignKey: 'playerId', as: 'vouchers' });
Voucher.belongsTo(Player, { foreignKey: 'playerId', as: 'player' });

Player.hasMany(Transaction, { foreignKey: 'playerId', as: 'transactions' });
Transaction.belongsTo(Player, { foreignKey: 'playerId', as: 'player' });

Voucher.hasMany(Transaction, { foreignKey: 'voucherId', as: 'transactions' });
Transaction.belongsTo(Voucher, { foreignKey: 'voucherId', as: 'voucher' });

module.exports = {
  sequelize,
  Player,
  Voucher,
  Transaction,
  Bet,
  Game
};
