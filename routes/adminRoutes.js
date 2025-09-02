const express = require('express'); const router = express.Router(); const admin = require('../controllers/adminReports');
// dummy admin auth
router.use((req,res,next)=>{ req.user={username:'admin', role:'admin'}; next(); });
router.get('/financials', admin.financials);
router.get('/game-stats', admin.gameStats);
router.get('/player/:id/activity', admin.playerActivity);
router.get('/player/:id/export', admin.exportPlayerCSV);
module.exports = router;
