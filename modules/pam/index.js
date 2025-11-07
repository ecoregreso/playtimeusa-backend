const createPamRouter = require('./routes');
const runPamMigrations = require('./migrations');

module.exports = {
  name: 'pam',
  async migrate(dbApi) {
    await runPamMigrations(dbApi);
  },
  register(app, dbApi, middlewares) {
    const router = createPamRouter(dbApi, middlewares);
    app.use('/api/pam', middlewares.authAdmin, router);
  }
};
