const mongoose = require('mongoose');

const splitSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    amount: { type: Number, required: true },
});

const transactionSchema = new mongoose.Schema(
    {
        clientId: { type: String, required: true, unique: true }, // UUID from client (for deduplication)
        groupId: { type: mongoose.Schema.Types.ObjectId, ref: 'Group', required: true },
        description: { type: String, required: true, trim: true },
        amount: { type: Number, required: true },
        paidBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
        receiverId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // For PAYMENT type
        splits: [splitSchema],
        splitType: { type: String, enum: ['EQUAL', 'CUSTOM', 'PERCENTAGE'], default: 'EQUAL' },
        type: { type: String, enum: ['EXPENSE', 'PAYMENT'], default: 'EXPENSE' },
        imageUrl: { type: String },
        syncedAt: { type: Date, default: Date.now },
    },
    { timestamps: true }
);

// Performance indexes
transactionSchema.index({ groupId: 1, createdAt: -1 });
transactionSchema.index({ groupId: 1, type: 1 });

module.exports = mongoose.model('Transaction', transactionSchema);
