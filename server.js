require('dotenv').config();
const express = require('express');
const { MongoClient } = require('mongodb');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;

// Middleware to parse JSON and serve the frontend files
app.use(express.json());
app.use(express.static('public'));

// FIX: Explicitly serve the frontend UI for Vercel
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const mongoUri = process.env.MONGODB_URI;
const databaseName = process.env.MONGODB_DB || 'bom_tracker';
let clientPromise;

const getCollection = async () => {
    if (!mongoUri) throw new Error('MONGODB_URI is not configured.');
    if (!clientPromise) {
        const client = new MongoClient(mongoUri);
        clientPromise = client.connect();
    }
    const client = await clientPromise;
    return client.db(databaseName).collection('inventory');
};

const sendDatabaseError = (res, error, message) => {
    console.error(message, error);
    res.status(mongoUri ? 500 : 503).json({ error: mongoUri ? message : 'Database is not configured.' });
};

// GET endpoint to fetch all components
app.get('/api/inventory', async (req, res) => {
    try {
        const inventory = await (await getCollection()).find({}).sort({ id: 1 }).toArray();
        res.json(inventory);
    } catch (err) {
        sendDatabaseError(res, err, 'Could not read database.');
    }
});

// POST endpoint to add a new component
app.post('/api/inventory', async (req, res) => {
    const { name, type = 'Component', quantity, location } = req.body;
    const parsedQuantity = Number(quantity);

    if (!name || !location || !Number.isInteger(parsedQuantity) || parsedQuantity < 0) {
        return res.status(400).json({ error: 'Name, location, and a non-negative whole quantity are required.' });
    }

    try {
        const prefix = type === 'Module' ? 'MOD' : 'CMP';
        const collection = await getCollection();
        const lastItem = await collection.find({ id: new RegExp(`^${prefix}-`) }).sort({ id: -1 }).limit(1).next();
        const nextNumber = lastItem ? Number(lastItem.id.slice(4)) + 1 : 1;
        const item = { id: `${prefix}-${String(nextNumber).padStart(3, '0')}`, name: name.trim(), type, quantity: parsedQuantity, location: location.trim() };
        await collection.insertOne(item);
        res.status(201).json(item);
    } catch (err) {
        sendDatabaseError(res, err, 'Could not save component.');
    }
});

// PATCH endpoint to update stock quantity
app.patch('/api/inventory/:id', async (req, res) => {
    const parsedQuantity = Number(req.body.quantity);
    if (!Number.isInteger(parsedQuantity) || parsedQuantity < 0) {
        return res.status(400).json({ error: 'Quantity must be a non-negative whole number.' });
    }

    try {
        const item = await (await getCollection()).findOneAndUpdate(
            { id: req.params.id },
            { $set: { quantity: parsedQuantity } },
            { returnDocument: 'after' }
        );
        if (!item) return res.status(404).json({ error: 'Component not found.' });
        res.json(item);
    } catch (err) {
        sendDatabaseError(res, err, 'Could not update stock.');
    }
});

// Start the server locally (ignored by Vercel)
if (require.main === module) {
    app.listen(PORT, '0.0.0.0', () => {
        console.log(`BOM Tracker running at http://localhost:${PORT}`);
    });
}

// Export for Vercel Serverless Functions
module.exports = app;