const express = require('express');
const authenticate = require('../middleware/auth');
const {
    getProfile,
    updateProfile,
    updateUpiId,
} = require('../controllers/userController');

const router = express.Router();

// GET /api/user/profile
router.get('/profile', authenticate, (req, res) => getProfile(req, res));

// PUT /api/user/profile
router.put('/profile', authenticate, (req, res) => updateProfile(req, res));

// PUT /api/user/upi-id
router.put('/upi-id', authenticate, (req, res) => updateUpiId(req, res));

module.exports = router;
