// Use Google DNS to bypass ISP DNS blocks on MongoDB SRV records
const dns = require('dns');
dns.setServers(['8.8.8.8', '8.8.4.4']);

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const cookieParser = require('cookie-parser');
const mongoose = require('mongoose');

const authRoutes = require('./routes/auth');
const syncRoutes = require('./routes/sync');
const expenseRoutes = require('./routes/expenses');
const userRoutes = require('./routes/user');
const groupRoutes = require('./routes/groups');

const app = express();

// Security headers
app.use(helmet({
  contentSecurityPolicy: false, // Disable CSP for now (inline scripts used)
}));

// CORS — dynamically allow origins for Vercel
app.use(cors({
  origin: function (origin, callback) {
    // Reflect the requesting origin back dynamically to support Vercel preview domains
    callback(null, origin || true);
  },
  credentials: true, // Allow cookies
}));

// General API rate limiter — relaxed, 600 requests per 15 minutes
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 600,
  message: { error: 'Too many requests. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Body parsing & cookies
app.use(express.json());
app.use(cookieParser());
app.use(express.static('public'));
app.use('/images', express.static('images'));

// Routes
// Note: /api/auth has its own strict 15req/15min rate limiter defined inside authRoutes
app.use('/api/auth', authRoutes);
app.use('/api/sync', apiLimiter, syncRoutes);
app.use('/api/expenses', apiLimiter, expenseRoutes);
app.use('/api/user', apiLimiter, userRoutes);
app.use('/api/groups', apiLimiter, groupRoutes);

// Health Check
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', time: new Date().toISOString() });
});

// Connect to MongoDB and start server
const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI;
const shouldAutoConnect = process.env.NODE_ENV !== 'test';

if (shouldAutoConnect) {
  mongoose
    .connect(MONGODB_URI)
    .then(() => {
      console.log('✅ Connected to MongoDB');
      // Only listen if executed directly (local dev). Vercel requires exporting the app instead.
      if (require.main === module) {
        app.listen(PORT, () => {
          console.log(`🚀 Server running on http://localhost:${PORT}`);
        });
      }
    })
    .catch((err) => {
      console.error('❌ MongoDB connection error:', err.message);
      if (require.main === module) {
        process.exit(1);
      }
    });
}

// Export the Express API for Vercel Serverless
module.exports = app;
