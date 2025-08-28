const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const Game = sequelize.define('Game',{ id:{type:DataTypes.INTEGER,primaryKey:true,autoIncrement:true}, code:{type:DataTypes.STRING, unique:true}, name:{type:DataTypes.STRING}, category:{type:DataTypes.STRING}, active:{type:DataTypes.BOOLEAN, defaultValue:true} });
module.exports = Game;
