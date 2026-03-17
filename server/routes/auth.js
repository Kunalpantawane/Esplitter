const express = require('express');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const User = require('../models/User');

const router = express.Router();

const ACCESS_EXPIRY = '15m';
const REFRESH_EXPIRY_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

// Rate limiter: 5 auth attempts per 15 minutes per IP
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    message: { error: 'Too many attempts. Please try again after 15 minutes.' },
    standardHeaders: true,
    legacyHeaders: false,
});

// --- Helpers ---
function generateAccessToken(userId) {
    return jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: ACCESS_EXPIRY });
}

function generateRefreshToken() {
    return crypto.randomBytes(40).toString('hex');
}

function setRefreshCookie(res, token) {
    res.cookie('refreshToken', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: REFRESH_EXPIRY_MS,
        path: '/api/auth',
    });
}

function clearRefreshCookie(res) {
    res.clearCookie('refreshToken', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        path: '/api/auth',
    });
}

// POST /api/auth/register
router.post('/register', authLimiter, async (req, res) => {
    try {
        const { name, email, password } = req.body;

        if (!name || !email || !password) {
            return res.status(400).json({ error: 'Name, email, and password are required.' });
        }

        // Validate password strength
        const pwError = User.validatePassword(password);
        if (pwError) return res.status(400).json({ error: pwError });

        const existing = await User.findOne({ email });
        if (existing) {
            return res.status(409).json({ error: 'Email already registered.' });
        }

        const refreshToken = generateRefreshToken();
        const user = new User({ name, email, password, refreshToken });
        await user.save();

        const accessToken = generateAccessToken(user._id);
        setRefreshCookie(res, refreshToken);

        res.status(201).json({
            token: accessToken,
            user: { id: user._id, name: user.name, email: user.email, phone: user.phone || '', upiId: user.upiId || '' },
        });
    } catch (err) {
        res.status(500).json({ error: 'Server error during registration.' });
    }
});

// POST /api/auth/login
router.post('/login', authLimiter, async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password are required.' });
        }

        const user = await User.findOne({ email });
        if (!user) {
            return res.status(401).json({ error: 'Invalid credentials.' });
        }

        const match = await user.comparePassword(password);
        if (!match) {
            return res.status(401).json({ error: 'Invalid credentials.' });
        }

        const refreshToken = generateRefreshToken();
        user.refreshToken = refreshToken;
        await user.save();

        const accessToken = generateAccessToken(user._id);
        setRefreshCookie(res, refreshToken);

        res.json({
            token: accessToken,
            user: { id: user._id, name: user.name, email: user.email, phone: user.phone || '', upiId: user.upiId || '' },
        });
    } catch (err) {
        res.status(500).json({ error: 'Server error during login.' });
    }
});

// POST /api/auth/refresh
router.post('/refresh', async (req, res) => {
    try {
        const token = req.cookies?.refreshToken;
        if (!token) {
            return res.status(401).json({ error: 'No refresh token provided.' });
        }

        const user = await User.findOne({ refreshToken: token });
        if (!user) {
            return res.status(401).json({ error: 'Invalid refresh token.' });
        }

        // Rotate refresh token
        const newRefreshToken = generateRefreshToken();
        user.refreshToken = newRefreshToken;
        await user.save();

        const accessToken = generateAccessToken(user._id);
        setRefreshCookie(res, newRefreshToken);

        res.json({
            token: accessToken,
            user: { id: user._id, name: user.name, email: user.email, phone: user.phone || '', upiId: user.upiId || '' },
        });
    } catch (err) {
        res.status(500).json({ error: 'Server error during token refresh.' });
    }
});

// POST /api/auth/logout
router.post('/logout', async (req, res) => {
    try {
        const token = req.cookies?.refreshToken;
        if (token) {
            await User.findOneAndUpdate({ refreshToken: token }, { refreshToken: null });
        }
        clearRefreshCookie(res);
        res.json({ message: 'Logged out successfully.' });
    } catch (err) {
        res.status(500).json({ error: 'Server error during logout.' });
    }
});

module.exports = router;
