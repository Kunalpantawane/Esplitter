const mongoose = require('mongoose');

/**
 * Connect to MongoDB with retry logic.
 * @param {string} uri - MongoDB connection URI
 * @param {object} [options] - Mongoose connection options
 * @param {number} [maxRetries=3] - Maximum number of connection attempts
 * @returns {Promise<void>}
 */
async function connectDB(uri, options = {}, maxRetries = 3) {
    const defaultOpts = {
        // Mongoose 8 defaults are sensible; override only if needed
        serverSelectionTimeoutMS: 10000,
        ...options,
    };

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            await mongoose.connect(uri, defaultOpts);
            console.log('✅ Connected to MongoDB');
            return;
        } catch (err) {
            console.error(
                `❌ MongoDB connection attempt ${attempt}/${maxRetries} failed:`,
                err.message
            );
            if (attempt === maxRetries) {
                throw err; // Let the caller decide what to do (exit, etc.)
            }
            // Exponential back-off: 1s, 2s, 4s …
            const delay = Math.pow(2, attempt - 1) * 1000;
            console.log(`   Retrying in ${delay / 1000}s…`);
            await new Promise((resolve) => setTimeout(resolve, delay));
        }
    }
}

module.exports = connectDB;
