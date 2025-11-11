const express = require('express');
const router = express.Router();

router.get('/', (_req, res) => {
  res.json({
    version: process.env.APP_VERSION || '0.1.0',
    uptimeSec: Math.floor(process.uptime()),
    db: 'ok'
  });
});

module.exports = router;
