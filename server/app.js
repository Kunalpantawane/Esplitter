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
const personalExpenseRoutes = require('./routes/personalExpenses');
const categoryRoutes = require('./routes/categories');
const budgetRoutes = require('./routes/budgets');
const Category = require('./models/Category');

const app = express();

// Security headers - Enable CSP with nonce for inline scripts
app.use((req, res, next) => {
  res.locals.nonce = require('crypto').randomBytes(16).toString('hex');
  next();
});

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: [
        "'self'",
        "'unsafe-inline'", // TODO: Remove after migrating to Vite modules
        "https://cdn.tailwindcss.com",
        "https://unpkg.com",
        "https://cdn.jsdelivr.net",
      ],
      styleSrc: [
        "'self'",
        "'unsafe-inline'",
        "https://fonts.googleapis.com",
      ],
      fontSrc: [
        "'self'",
        "https://fonts.gstatic.com",
      ],
      imgSrc: [
        "'self'",
        "data:",
        "https:",
      ],
      connectSrc: [
        "'self'",
        "https://unpkg.com",
        "https://cdn.jsdelivr.net",
        "https://cdn.tailwindcss.com",
        "https://fonts.googleapis.com",
        "https://fonts.gstatic.com",
      ],
    },
  },
}));

// CORS — explicit origin allowlist only
// Set CORS_ORIGINS in your .env / Vercel dashboard as a comma-separated list.
const ALLOWED_ORIGINS = (process.env.CORS_ORIGINS || 'http://localhost:5173,http://localhost:3000')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no Origin header (server-to-server, mobile apps, curl)
    if (!origin) return callback(null, true);
    // Allow explicit allowlist only (no wildcards)
    if (ALLOWED_ORIGINS.includes(origin)) return callback(null, origin);
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
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
app.use(express.json({ limit: '1mb' }));
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
app.use('/api/personal-expenses', apiLimiter, personalExpenseRoutes);
app.use('/api/categories', apiLimiter, categoryRoutes);
app.use('/api/budgets', apiLimiter, budgetRoutes);

// Health Check
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', time: new Date().toISOString() });
});

// --- Global Error Handler ---
// Catches all unhandled errors from async route handlers (via next(err) or throw)
app.use((err, req, res, _next) => {
  // Log full error in non-production for debugging
  if (process.env.NODE_ENV !== 'production') {
    console.error('[Global Error Handler]', err);
  } else {
    console.error('[Global Error Handler]', err.message);
  }

  // CORS error from our origin check
  if (err.message === 'Not allowed by CORS') {
    return res.status(403).json({ error: 'CORS: Origin not allowed.' });
  }

  const status = err.status || err.statusCode || 500;
  res.status(status).json({
    error: process.env.NODE_ENV === 'production'
      ? 'Internal server error.'
      : err.message || 'Internal server error.',
  });
});

// --- Process-level safety nets ---
process.on('unhandledRejection', (reason) => {
  console.error('[UnhandledRejection]', reason);
});
process.on('uncaughtException', (err) => {
  console.error('[UncaughtException]', err);
  // In production you'd want to gracefully shut down; for now, just log.
});

// Connect to MongoDB and start server
const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI;
const shouldAutoConnect = process.env.NODE_ENV !== 'test';

if (shouldAutoConnect) {
  mongoose
    .connect(MONGODB_URI)
    .then(async () => {
      console.log('✅ Connected to MongoDB');
      // Seed default categories
      try { await Category.seedDefaults(); } catch (e) { console.warn('Category seed skip:', e.message); }
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
