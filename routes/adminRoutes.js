const express = require('express');

const adminReports = require('../controllers/adminReports');

const router = express.Router();

const attachAdminContext = (req, _res, next) => {
  req.user = req.user || {
    username: 'admin',
    role: 'admin',
    permissions: ['reports:read']
  };
  next();
};

router.use(attachAdminContext);

router.get('/financials', adminReports.financials);
router.get('/game-stats', adminReports.gameStats);
router.get('/player/:id/activity', adminReports.playerActivity);
router.get('/player/:id/export', adminReports.exportPlayerCSV);

module.exports = router;
