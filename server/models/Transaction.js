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
        splits: [splitSchema],
        type: { type: String, enum: ['EXPENSE', 'PAYMENT'], default: 'EXPENSE' },
        syncedAt: { type: Date, default: Date.now },
    },
    { timestamps: true }
);

module.exports = mongoose.model('Transaction', transactionSchema);
