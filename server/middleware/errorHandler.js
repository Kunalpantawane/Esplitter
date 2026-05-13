/**
 * Centralized async error handler middleware.
 * Mount this AFTER all routes: app.use(errorHandler)
 */
function errorHandler(err, req, res, _next) {
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
}

module.exports = errorHandler;
