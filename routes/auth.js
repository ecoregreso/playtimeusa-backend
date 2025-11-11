const express = require('express');
const jwt = require('jsonwebtoken');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.post('/login', (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'missing_credentials', code: 400 });
  const role = /admin/i.test(email) ? 'admin' : 'agent';
  const token = jwt.sign({ sub: email, role }, process.env.JWT_SECRET, { expiresIn: '15m' });
  res.json({ token, user: { email, role } });
});

router.get('/me', requireAuth(), (req, res) => {
  res.json({ user: req.user });
});

module.exports = router;
