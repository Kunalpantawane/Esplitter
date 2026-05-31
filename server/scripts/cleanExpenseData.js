/**
 * Clean all expense data from MongoDB while preserving User credentials
 * Usage: node server/scripts/cleanExpenseData.js
 */

require('dotenv').config();
const dns = require('dns');
const mongoose = require('mongoose');
const connectDB = require('../config/db');

// Use the same DNS workaround as the main server so SRV MongoDB URIs resolve reliably.
dns.setServers(['8.8.8.8', '8.8.4.4']);

const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://localhost:27017/esplitter';

async function cleanExpenseData() {
    try {
        // Connect to database
        await connectDB(MONGO_URI);
        console.log('📦 Connected to MongoDB');

        // Delete every non-auth collection so only login data remains.
        const protectedCollections = new Set(['users']);
        const allCollections = await mongoose.connection.db.listCollections().toArray();
        const collectionsToDelete = allCollections
            .map((collection) => collection.name)
            .filter((name) => !protectedCollections.has(name) && !name.startsWith('system.'));

        console.log('\n🗑️  Cleaning expense data...');

        for (const collection of collectionsToDelete) {
            try {
                const result = await mongoose.connection.db.collection(collection).deleteMany({});
                console.log(`   ✅ ${collection}: Deleted ${result.deletedCount} documents`);
            } catch (err) {
                if (err.message.includes('does not exist')) {
                    console.log(`   ⚠️  ${collection}: Collection does not exist (skipped)`);
                } else {
                    console.error(`   ❌ ${collection}: Error -`, err.message);
                }
            }
        }

        console.log('\n📊 Database Summary:');
        const collections = await mongoose.connection.db.listCollections().toArray();
        for (const col of collections) {
            const count = await mongoose.connection.db.collection(col.name).countDocuments();
            console.log(`   • ${col.name}: ${count} documents`);
        }

        console.log('\n✨ Cleanup complete! Users and credentials preserved.');
        process.exit(0);
    } catch (err) {
        console.error('❌ Cleanup failed:', err.message);
        process.exit(1);
    }
}

cleanExpenseData();
