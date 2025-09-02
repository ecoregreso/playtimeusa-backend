const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  return sequelize.define('Game', {
    name: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    jackpot: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
    },
  });
};

