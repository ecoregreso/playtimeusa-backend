const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Bet = sequelize.define(
  'Bet',
  {
    id: {
      type: DataTypes.BIGINT,
      primaryKey: true,
      autoIncrement: true
    },
    playerId: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    gameId: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    stake: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
      defaultValue: 0
    },
    payout: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
      defaultValue: 0
    },
    result: {
      type: DataTypes.JSON,
      allowNull: true
    }
  },
  {
    tableName: 'Bets',
    indexes: [
      {
        fields: ['playerId']
      },
      {
        fields: ['gameId']
      }
    ]
  }
);

module.exports = Bet;
