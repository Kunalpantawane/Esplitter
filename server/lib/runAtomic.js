const mongoose = require('mongoose');

async function runAtomic(writeWork) {
    const session = await mongoose.startSession();
    try {
        await session.withTransaction(async () => {
            await writeWork(session);
        });
        return { atomic: true };
    } catch (err) {
        const txUnsupported = String(err.message || '').toLowerCase().includes('transaction numbers are only allowed');
        if (!txUnsupported) throw err;
        await writeWork(null);
        return { atomic: false };
    } finally {
        await session.endSession();
    }
}

module.exports = runAtomic;
