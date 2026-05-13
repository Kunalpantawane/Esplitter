const Razorpay = require('razorpay');

let cachedClient = null;
let cachedKeyId = null;
let cachedKeySecret = null;

function isConfigured() {
    return Boolean(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET);
}

function getRazorpayKeyId() {
    return process.env.RAZORPAY_KEY_ID || '';
}

function getRazorpayClient() {
    const keyId = process.env.RAZORPAY_KEY_ID;
    const keySecret = process.env.RAZORPAY_KEY_SECRET;

    if (!keyId || !keySecret) {
        const error = new Error('Razorpay is not configured.');
        error.status = 503;
        throw error;
    }

    if (!cachedClient || cachedKeyId !== keyId || cachedKeySecret !== keySecret) {
        cachedClient = new Razorpay({
            key_id: keyId,
            key_secret: keySecret,
        });
        cachedKeyId = keyId;
        cachedKeySecret = keySecret;
    }

    return cachedClient;
}

module.exports = {
    getRazorpayClient,
    getRazorpayKeyId,
    isConfigured,
};