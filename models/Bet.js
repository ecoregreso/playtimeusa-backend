const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const Bet = sequelize.define('Bet',{ id:{type:DataTypes.BIGINT,primaryKey:true,autoIncrement:true}, playerId:{type:DataTypes.INTEGER}, gameId:{type:DataTypes.INTEGER}, stake:{type:DataTypes.DECIMAL(12,2)}, payout:{type:DataTypes.DECIMAL(12,2), defaultValue:0}, result:{type:DataTypes.JSON} });
module.exports = Bet;
