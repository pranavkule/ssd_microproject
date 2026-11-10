const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema(
  {
    orderId: {
      type: mongoose.Schema.Types.ObjectId,
      required: [true, 'Order id is required'],
      ref: 'Order',
    },
    amount: {
      type: Number,
      required: [true, 'Amount is required'],
      min: [0.01, 'Amount must be greater than zero'],
    },
    paymentMethod: {
      type: String,
      required: [true, 'Payment method is required'],
      enum: {
        values: ['UPI', 'card', 'netbanking'],
        message: 'Payment method must be UPI, card, or netbanking',
      },
    },
    status: {
      type: String,
      required: [true, 'Payment status is required'],
      enum: {
        values: ['pending', 'successful', 'failed'],
        message: 'Payment status must be pending, successful, or failed',
      },
      default: 'pending',
    },
    transactionId: {
      type: String,
      required: [true, 'Transaction id is required'],
      unique: true,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

module.exports = mongoose.model('Payment', paymentSchema);
