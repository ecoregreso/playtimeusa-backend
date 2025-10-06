const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config();

const { sequelize } = require('./models');
const cashierRoutes = require('./routes/cashierRoutes');
const playerRoutes = require('./routes/playerRoutes');
const gameRoutes = require('./routes/gameRoutes');
const adminRoutes = require('./routes/adminRoutes');

const app = express();
const PORT = process.env.PORT || 3000;
const shouldExitAfterBoot = process.argv.includes('--exit');

const sanitizeBaseUrl = (url) => (url.endsWith('/') ? url.slice(0, -1) : url);
const FRONTEND_BASE_URL = sanitizeBaseUrl(
  process.env.FRONTEND_URL || process.env.PUBLIC_URL || `http://localhost:${PORT}`
);

app.use(cors({ origin: '*' }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

app.use('/api/cashier', cashierRoutes);
app.use('/api/player', playerRoutes);
app.use('/api/game', gameRoutes);
app.use('/api/admin', adminRoutes);

app.get('/', (req, res) => {
  if (req.accepts('html')) {
    return res.sendFile(path.join(__dirname, 'public', 'cashier.html'));
  }
  res.json({ message: 'Casino backend is running 🚀' });
});

app.get('/cashier', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'cashier.html'));
});

app.get('/login', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

let httpServer;

const gracefulShutdown = async (reason) => {
  console.log(`\nShutting down server (${reason}).`);

  if (httpServer) {
    await new Promise((resolve) => httpServer.close(resolve));
    httpServer = null;
  }

  try {
    await sequelize.close();
  } catch (error) {
    console.error('Error while closing database connection:', error);
  }
};

const startServer = async () => {
  try {
    await sequelize.authenticate();
    await sequelize.sync();

    httpServer = app.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
      console.log(`💳 Cashier portal: ${FRONTEND_BASE_URL}/cashier.html`);
    });

    if (shouldExitAfterBoot) {
      setImmediate(() => {
        gracefulShutdown('CLI --exit flag triggered')
          .then(() => process.exit(0))
          .catch((error) => {
            console.error('Failed to shutdown after --exit flag:', error);
            process.exit(1);
          });
      });
    }
  } catch (error) {
    console.error('❌ Server startup failed due to database error.', error);
    process.exit(1);
  }
};

['SIGINT', 'SIGTERM'].forEach((signal) => {
  process.on(signal, () => {
    gracefulShutdown(signal)
      .then(() => process.exit(0))
      .catch((error) => {
        console.error('Graceful shutdown failed:', error);
        process.exit(1);
      });
  });
});

startServer();

module.exports = app;
