const mongoose = require("mongoose");

const voucherSchema = new mongoose.Schema({
  userCode: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  pin: { type: String, required: true },
  amount: { type: Number, required: true },
  bonus: { type: Number, required: true },
  balance: { type: Number, required: true },
  isUsed: { type: Boolean, default: false }
});

module.exports = mongoose.model("Voucher", voucherSchema);
