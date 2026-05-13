const mongoose = require('mongoose');

const paymentRecordSchema = new mongoose.Schema(
  {
    razorpayOrderId: {
      type: String,
      required: true,
      index: true,
    },
    razorpayPaymentId: {
      type: String,
      index: true,
      sparse: true,
    },
    webhookEventId: {
      type: String,
      index: true,
      sparse: true,
      unique: true,
    },
    clientId: {
      type: String,
      required: true,
      index: true,
    },
    groupId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Group',
      required: true,
      index: true,
    },
    debtorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    creditorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 1,
    },
    status: {
      type: String,
      enum: ['pending', 'authorized', 'captured', 'failed', 'refunded'],
      default: 'pending',
      index: true,
    },
    errorReason: {
      type: String,
      sparse: true,
    },
    webhookEvents: [
      {
        eventId: String,
        event: String,
        receivedAt: { type: Date, default: Date.now },
        processed: { type: Boolean, default: true },
      },
    ],
    lastVerifiedAt: {
      type: Date,
      sparse: true,
      index: true,
    },
    description: String,
  },
  { timestamps: true }
);

paymentRecordSchema.index({ groupId: 1, status: 1 });
paymentRecordSchema.index({ groupId: 1, createdAt: -1 });

const PaymentRecord = mongoose.model('PaymentRecord', paymentRecordSchema);

module.exports = PaymentRecord;
