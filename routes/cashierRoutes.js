const express = require('express');
const router = express.Router();

const cashier = require('../controllers/cashierController');

router.get('/voucher', cashier.listVouchers);
router.post('/voucher', cashier.createVoucher);

module.exports = router;
