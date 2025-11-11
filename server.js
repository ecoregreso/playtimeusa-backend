const app = require('./app');
const PORT = process.env.PORT || 10000;
const HOST = '0.0.0.0';
if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, HOST, () => console.log(`listening on http://${HOST}:${PORT}`));
}
module.exports = app;
