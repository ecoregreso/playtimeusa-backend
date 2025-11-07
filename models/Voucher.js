const mongoose = require('mongoose');
const mongoose = require("mongoose");

const voucherSchema = new mongoose.Schema({
  userCode: { type: String, required: true },
  userCode: { type: String, required: true, unique: true },
  pin: { type: String, required: true },
  amount: { type: Number, required: true },
  bonus: { type: Number, required: true },
  createdAt: { type: Date, default: Date.now }
  balance: { type: Number, required: true },
  isUsed: { type: Boolean, default: false }
});

module.exports = mongoose.model('Voucher', voucherSchema);
module.exports = mongoose.model("Voucher", voucherSchema);
