const User = require('../models/User');

function toUserResponse(user) {
    return {
        id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone || '',
        upiId: user.upiId || '',
    };
}

// GET /api/user/profile
async function getProfile(req, res) {
    try {
        const user = await User.findById(req.userId).select('-password -refreshToken');
        if (!user) return res.status(404).json({ error: 'User not found.' });
        res.json(toUserResponse(user));
    } catch (err) {
        res.status(500).json({ error: 'Server error fetching profile.' });
    }
}

// PUT /api/user/profile
async function updateProfile(req, res) {
    try {
        const { name, phone } = req.body;
        const update = {};

        if (name && name.trim()) update.name = name.trim();
        if (phone !== undefined) update.phone = String(phone || '').trim();

        if (Object.keys(update).length === 0) {
            return res.status(400).json({ error: 'No fields to update.' });
        }

        const user = await User.findByIdAndUpdate(req.userId, update, { new: true })
            .select('-password -refreshToken');
        if (!user) return res.status(404).json({ error: 'User not found.' });

        res.json(toUserResponse(user));
    } catch (err) {
        res.status(500).json({ error: 'Server error updating profile.' });
    }
}

// PUT /api/user/upi-id
async function updateUpiId(req, res) {
    try {
        const upiId = String(req.body.upiId || '').trim().toLowerCase();
        if (!upiId) return res.status(400).json({ error: 'UPI ID is required.' });

        const validationError = User.validateUpiId(upiId);
        if (validationError) return res.status(400).json({ error: validationError });

        const user = await User.findByIdAndUpdate(
            req.userId,
            { upiId },
            { new: true }
        ).select('-password -refreshToken');

        if (!user) return res.status(404).json({ error: 'User not found.' });

        res.json(toUserResponse(user));
    } catch (err) {
        res.status(500).json({ error: 'Server error updating UPI ID.' });
    }
}

module.exports = {
    getProfile,
    updateProfile,
    updateUpiId,
};