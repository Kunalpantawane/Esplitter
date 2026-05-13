const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const User = require('../models/User');

// --- Token config ---
const ACCESS_EXPIRY = '15m';
const REFRESH_EXPIRY_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

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
        sameSite: 'lax',
        maxAge: REFRESH_EXPIRY_MS,
        path: '/api/auth',
    });
}

function clearRefreshCookie(res) {
    res.clearCookie('refreshToken', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/api/auth',
    });
}

/** Sanitised user object for API responses */
function safeUser(user) {
    return {
        id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone || '',
        upiId: user.upiId || '',
    };
}

// --- Controllers ---

/** POST /api/auth/register */
async function register(req, res) {
    try {
        const { name, email, password } = req.body;
        const upiId = String(req.body.upiId || '').trim().toLowerCase();

        if (!name || !email || !password || !upiId) {
            return res.status(400).json({ error: 'Name, email, password, and UPI ID are required.' });
        }

        // Validate password strength
        const pwError = User.validatePassword(password);
        if (pwError) return res.status(400).json({ error: pwError });

        // Validate UPI ID
        const upiError = User.validateUpiId(upiId);
        if (upiError) return res.status(400).json({ error: upiError });

        const normalizedEmail = String(email).trim().toLowerCase();

        const existing = await User.findOne({ email: normalizedEmail });
        if (existing) {
            return res.status(409).json({ error: 'Email already registered.' });
        }

        const existingUpi = await User.findOne({ upiId });
        if (existingUpi) {
            return res.status(409).json({ error: 'UPI ID already registered to another account.' });
        }

        const refreshToken = generateRefreshToken();
        const user = new User({
            name: String(name).trim(),
            email: normalizedEmail,
            password,
            upiId,
            refreshToken,
        });
        await user.save();

        const accessToken = generateAccessToken(user._id);
        setRefreshCookie(res, refreshToken);

        res.status(201).json({ token: accessToken, user: safeUser(user) });
    } catch (err) {
        res.status(500).json({ error: 'Server error during registration.' });
    }
}

/** POST /api/auth/login */
async function login(req, res) {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password are required.' });
        }

        const normalizedEmail = String(email).trim().toLowerCase();
        const user = await User.findOne({ email: normalizedEmail });
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

        res.json({ token: accessToken, user: safeUser(user) });
    } catch (err) {
        res.status(500).json({ error: 'Server error during login.' });
    }
}

/** POST /api/auth/refresh */
async function refresh(req, res) {
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

        res.json({ token: accessToken, user: safeUser(user) });
    } catch (err) {
        res.status(500).json({ error: 'Server error during token refresh.' });
    }
}

/** POST /api/auth/logout */
async function logout(req, res) {
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
}

module.exports = { register, login, refresh, logout };
