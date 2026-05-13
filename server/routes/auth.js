const express = require('express');
const rateLimit = require('express-rate-limit');
const { register, login, refresh, logout } = require('../controllers/authController');

const router = express.Router();

// Rate limiter: 15 auth attempts per 15 minutes per IP (disabled in test)
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 15,
    message: { error: 'Too many attempts. Please try again after 15 minutes.' },
    standardHeaders: true,
    legacyHeaders: false,
    skip: () => process.env.NODE_ENV === 'test',
});

router.post('/register', authLimiter, register);
router.post('/login', authLimiter, login);
router.post('/refresh', refresh);
router.post('/logout', logout);

module.exports = router;
