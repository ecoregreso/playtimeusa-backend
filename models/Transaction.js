const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const Transaction = sequelize.define('Transaction',{ id:{type:DataTypes.INTEGER,primaryKey:true,autoIncrement:true}, playerId:{type:DataTypes.INTEGER}, type:{type:DataTypes.STRING}, amount:{type:DataTypes.DECIMAL(12,2)}, beforeBalance:{type:DataTypes.DECIMAL(12,2)}, afterBalance:{type:DataTypes.DECIMAL(12,2)}, source:{type:DataTypes.STRING}, meta:{type:DataTypes.JSON} });
module.exports = Transaction;
