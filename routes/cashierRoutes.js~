const express = require('express');
const router = express.Router();
const cashier = require('../controllers/cashierController');

router.post('/voucher', cashier.createVoucher);

module.exports = router;

const express = require('express'); const router = express.Router(); const cashier = require('../controllers/cashierController');
// dummy auth (replace in prod)
router.use((req,res,next)=>{ req.user = { username:'cashier1', role:'cashier' }; next(); });
router.post('/voucher', cashier.createVoucher);
module.exports = router;
