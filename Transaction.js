const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ['deposit', 'spin', 'win', 'withdraw'],
      required: true
    },
    amount: { type: Number, required: true },
    balanceAfter: { type: Number, required: true },
    userCode: { type: String, required: true, index: true }
  },
  {
    timestamps: true
  }
);

module.exports = mongoose.model('Transaction', transactionSchema);
