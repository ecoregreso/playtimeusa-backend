const mongoose = require("mongoose");

const VoucherSchema = new mongoose.Schema(
  { amountFunCents: { type: Number, required: true, min: 0 } },
  { timestamps: true }
);

module.exports = mongoose.model("Voucher", VoucherSchema);
// models/Voucher.js (after schema)
VoucherSchema.index({ createdAt: -1 });
