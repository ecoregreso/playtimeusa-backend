const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const Player = sequelize.define('Player',{ id:{type:DataTypes.INTEGER, primaryKey:true, autoIncrement:true}, username:{type:DataTypes.STRING, unique:true}, pin:{type:DataTypes.STRING}, mainBalance:{type:DataTypes.DECIMAL(12,2), defaultValue:0}, bonusBalance:{type:DataTypes.DECIMAL(12,2), defaultValue:0}, sessionActive:{type:DataTypes.BOOLEAN, defaultValue:false} });
module.exports = Player;
