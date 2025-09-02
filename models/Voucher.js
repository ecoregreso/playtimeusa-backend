const mongoose = require('mongoose');

const voucherSchema = new mongoose.Schema({
  userCode: { type: String, required: true },
  pin: { type: String, required: true },
  amount: { type: Number, required: true },
  bonus: { type: Number, required: true },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Voucher', voucherSchema);
