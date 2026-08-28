require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { MongoClient } = require('mongodb');

const uri = process.env.MONGODB_URI;
const databaseName = process.env.MONGODB_DB || 'bom_tracker';

if (!uri) {
    console.error('Set MONGODB_URI before running the seed command.');
    process.exit(1);
}

const seed = async () => {
    const client = new MongoClient(uri);
    // Reads the inventory.json file from your main folder
    const inventory = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'inventory.json'), 'utf8'));

    try {
        await client.connect();
        const collection = client.db(databaseName).collection('inventory');
        await collection.createIndex({ id: 1 }, { unique: true });
        
        const operations = inventory.map(item => ({
            updateOne: { filter: { id: item.id }, update: { $set: item }, upsert: true }
        }));
        
        if (operations.length) await collection.bulkWrite(operations);
        console.log(`Seeded ${inventory.length} inventory records into ${databaseName}.inventory.`);
    } finally {
        await client.close();
    }
};

seed().catch(error => {
    console.error('Could not seed MongoDB:', error.message);
    process.exit(1);
});