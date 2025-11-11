const mongoose = require('mongoose');

const VoucherSchema = new mongoose.Schema(
  { amountFunCents: { type: Number, required: true, min: 0 } },
  { timestamps: true }
);

VoucherSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Voucher', VoucherSchema);
