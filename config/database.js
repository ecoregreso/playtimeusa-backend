const path = require('path');
const { Sequelize } = require('sequelize');

const resolveStoragePath = () => {
  const configuredPath = process.env.SQLITE_STORAGE;
  if (configuredPath && configuredPath.trim().length > 0) {
    return configuredPath;
  }
  return path.join(__dirname, '..', 'database.sqlite');
};

const shouldLogSql = () => {
  const flag = process.env.SQL_DEBUG;
  if (!flag) return false;
  return ['1', 'true', 'yes', 'on'].includes(flag.toLowerCase());
};

const sequelize = new Sequelize({
  dialect: 'sqlite',
  storage: resolveStoragePath(),
  logging: shouldLogSql() ? (sql, timing) => console.debug(`[sequelize] ${sql}`, timing ?? '') : false,
  define: {
    underscored: false,
    freezeTableName: false
  }
});

module.exports = sequelize;
