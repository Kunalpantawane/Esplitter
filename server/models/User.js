const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

const userSchema = new mongoose.Schema(
    {
        name: { type: String, required: true, trim: true },
        email: { type: String, required: true, unique: true, lowercase: true, trim: true },
        password: { type: String, required: true },
        phone: { type: String, trim: true, sparse: true },
        upiId: { type: String, trim: true },
        refreshToken: { type: String },
    },
    { timestamps: true }
);

// Password strength validation
userSchema.statics.validatePassword = function (password) {
    if (!password || password.length < 8) return 'Password must be at least 8 characters.';
    if (!/[A-Z]/.test(password)) return 'Password must contain at least one uppercase letter.';
    if (!/[0-9]/.test(password)) return 'Password must contain at least one number.';
    return null; // valid
};

// UPI ID format validation
userSchema.statics.validateUpiId = function (upiId) {
    if (!upiId) return null; // optional
    if (!/^[\w.\-]+@[\w]+$/.test(upiId)) return 'Invalid UPI ID format. Use format: name@bank';
    return null;
};

// Hash password before saving
userSchema.pre('save', async function (next) {
    if (!this.isModified('password')) return next();
    this.password = await bcrypt.hash(this.password, 10);
    next();
});

// Method to compare passwords
userSchema.methods.comparePassword = function (plain) {
    return bcrypt.compare(plain, this.password);
};

module.exports = mongoose.model('User', userSchema);
