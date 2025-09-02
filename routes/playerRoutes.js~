const express = require('express');
const router = express.Router();
const playerController = require('../controllers/playerController');

// Manual login (User Code + PIN)
router.post('/login', playerController.login);

// QR auto-login (token-based)
router.post('/token-login', playerController.loginWithToken);

module.exports = router;

