const mongoose = require('mongoose');

const voucherSchema = new mongoose.Schema(
  {
    userCode: { type: String, required: true, unique: true, index: true },
    password: { type: String, required: true },
    amount: { type: Number, required: true, min: 1 },
    bonus: { type: Number, required: true, min: 0 },
    balance: { type: Number, required: true, min: 0 },
    isUsed: { type: Boolean, default: false }
  },
  {
    timestamps: true
  }
);

module.exports = mongoose.model('Voucher', voucherSchema);
