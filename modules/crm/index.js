const createCrmRouter = require('./routes');
const runCrmMigrations = require('./migrations');

module.exports = {
  name: 'crm',
  async migrate(dbApi) {
    await runCrmMigrations(dbApi);
  },
  register(app, dbApi, middlewares) {
    const router = createCrmRouter(dbApi);
    app.use('/api/crm', middlewares.authAdmin, router);
  }
};
