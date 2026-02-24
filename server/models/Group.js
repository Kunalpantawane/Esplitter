const mongoose = require('mongoose');
const { v4: uuidv4 } = require('crypto');

const groupSchema = new mongoose.Schema(
    {
        name: { type: String, required: true, trim: true },
        adminId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
        members: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
        inviteCode: { type: String, unique: true },
        lastActivityAt: { type: Date, default: Date.now },
    },
    { timestamps: true }
);

// Auto-generate invite code before saving
groupSchema.pre('save', function (next) {
    if (!this.inviteCode) {
        // Generate a short 6-char alphanumeric code
        this.inviteCode = Math.random().toString(36).substring(2, 8).toUpperCase();
    }
    next();
});

module.exports = mongoose.model('Group', groupSchema);
