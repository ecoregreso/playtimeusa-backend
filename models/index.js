const { Sequelize } = require('sequelize');
require('dotenv').config();

const sequelize = new Sequelize(process.env.DB_URI, {
  dialect: 'mysql', // or 'postgres', 'sqlite', etc.
});

// Import your models
const Game = require('./game')(sequelize);

// Export sequelize and models
module.exports = {
  sequelize,
  Game,
};

