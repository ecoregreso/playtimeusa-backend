require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const app = express();
app.use(express.json());
const funcoinOnly = require('./middleware/funcoin-only');
app.use(funcoinOnly);
app.use(express.urlencoded({ extended: true }));
app.use(helmet());
app.use(rateLimit({ windowMs: 60_000, max: 120 }));
app.use(cors({ origin: (_o, cb) => cb(null, true), credentials: true }));

app.get('/healthz', (_req, res) => res.status(200).send('ok'));
app.get('/', (_req, res) => res.json({ status: 'ok' }));

// mount cashier routes if present
try { app.use('/api/cashier', require('./routes/cashier')); } catch {}

module.exports = app;
