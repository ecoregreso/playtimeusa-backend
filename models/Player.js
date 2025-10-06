const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Player = sequelize.define(
  'Player',
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    username: {
      type: DataTypes.STRING(64),
      unique: true,
      allowNull: false
    },
    pin: {
      type: DataTypes.STRING(24),
      allowNull: false
    },
    mainBalance: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
      defaultValue: 0
    },
    bonusBalance: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
      defaultValue: 0
    },
    sessionActive: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false
    }
  },
  {
    tableName: 'Players'
  }
);

module.exports = Player;
