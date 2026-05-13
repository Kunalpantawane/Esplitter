/**
 * Clean all expense data from MongoDB while preserving User credentials
 * Usage: node server/scripts/cleanExpenseData.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('../config/db');

const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://localhost:27017/esplitter';

async function cleanExpenseData() {
    try {
        // Connect to database
        await connectDB(MONGO_URI);
        console.log('📦 Connected to MongoDB');

        // Collections to delete (all expense-related)
        const collectionsToDelete = [
            'transactions',     // All expenses and payments
            'groups',          // Group records
            'personalexpenses', // Personal expense tracker
            'categories',      // Expense categories
            'budgets',         // Budget records
        ];

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
