const mongoose = require('mongoose');

const joinRequestSchema = new mongoose.Schema(
    {
        userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
        status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
        requestedAt: { type: Date, default: Date.now },
        reviewedAt: { type: Date },
        reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    },
    { _id: true }
);

const groupSchema = new mongoose.Schema(
    {
        name: { type: String, required: true, trim: true },
        description: { type: String, trim: true, default: '' },
        adminId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
        members: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
        memberRoles: {
            type: Map,
            of: String,
            default: {},
        },
        joinRequests: [joinRequestSchema],
        inviteCode: { type: String, unique: true },
        isArchived: { type: Boolean, default: false },
        lastActivityAt: { type: Date, default: Date.now },
    },
    { timestamps: true }
);

// Indexes
groupSchema.index({ adminId: 1, createdAt: -1 });
groupSchema.index({ lastActivityAt: 1 });
groupSchema.index({ members: 1, lastActivityAt: -1 });

// Auto-generate invite code before saving
groupSchema.pre('save', function (next) {
    if (!this.inviteCode) {
        this.inviteCode = Math.random().toString(36).substring(2, 8).toUpperCase();
    }
    next();
});

module.exports = mongoose.model('Group', groupSchema);
