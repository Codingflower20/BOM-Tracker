require('dotenv').config();
const express = require('express');
const crypto = require('crypto');
const { MongoClient } = require('mongodb');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static('public'));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const mongoUri = process.env.MONGODB_URI;
const adminPassword = process.env.ADMIN_PASSWORD;
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

const requireAdminPassword = (req, res, next) => {
    const providedPassword = req.get('x-admin-password');
    if (!adminPassword) return res.status(503).json({ error: 'Server missing admin password configuration.' });
    if (!providedPassword) return res.status(401).json({ error: 'Admin access required.' });

    const expected = Buffer.from(adminPassword);
    const provided = Buffer.from(providedPassword);
    if (expected.length !== provided.length || !crypto.timingSafeEqual(expected, provided)) {
        return res.status(401).json({ error: 'Invalid admin credentials.' });
    }
    next();
};

const checkLocationConflict = async (collection, location, currentId = null) => {
    if (!location || location.toLowerCase() === 'unassigned') return false;
    const query = { location: location, quantity: { $gt: 0 } };
    if (currentId) query.id = { $ne: currentId };
    return await collection.findOne(query);
};

// GET: Fetch all inventory (Active and Archived)
app.get('/api/inventory', async (req, res) => {
    try {
        const inventory = await (await getCollection()).find({}).sort({ id: 1 }).toArray();
        res.json(inventory);
    } catch (err) {
        res.status(500).json({ error: 'Could not read database.' });
    }
});

// POST: Add new entity
app.post('/api/inventory', requireAdminPassword, async (req, res) => {
    const { name, type = 'Component', quantity, location } = req.body;
    const parsedQty = Number(quantity);
    const safeLoc = location ? location.trim() : 'Unassigned';

    if (!name?.trim() || !Number.isInteger(parsedQty) || parsedQty <= 0) {
        return res.status(400).json({ error: 'Name and a positive quantity are required.' });
    }

    try {
        const collection = await getCollection();
        const conflict = await checkLocationConflict(collection, safeLoc);
        if (conflict) return res.status(409).json({ error: `Location ${safeLoc} is occupied by ${conflict.name}.` });

        const prefix = type === 'Module' ? 'MOD' : 'CMP';
        const lastItem = await collection.find({ id: new RegExp(`^${prefix}-`) }).sort({ id: -1 }).limit(1).next();
        const nextId = lastItem ? Number(lastItem.id.slice(4)) + 1 : 1;
        
        const item = { 
            id: `${prefix}-${String(nextId).padStart(3, '0')}`, 
            name: name.trim(), 
            type, 
            quantity: parsedQty, 
            location: safeLoc 
        };
        
        await collection.insertOne(item);
        res.status(201).json(item);
    } catch (err) {
        res.status(500).json({ error: 'Could not save component.' });
    }
});

// PATCH: Update entity or handle stock depletion
app.patch('/api/inventory/:id', requireAdminPassword, async (req, res) => {
    const { name, location } = req.body;
    const parsedQty = Number(req.body.quantity);
    const safeLoc = location ? location.trim() : 'Unassigned';

    if (!name?.trim() || !Number.isInteger(parsedQty) || parsedQty < 0) {
        return res.status(400).json({ error: 'Valid name and a non-negative quantity are required.' });
    }

    try {
        const collection = await getCollection();
        const item = await collection.findOne({ id: req.params.id });
        if (!item) return res.status(404).json({ error: 'Component not found.' });

        const isDepleted = parsedQty === 0;
        const finalLoc = isDepleted ? 'Unassigned' : safeLoc;

        if (!isDepleted) {
            const conflict = await checkLocationConflict(collection, finalLoc, item.id);
            if (conflict) return res.status(409).json({ error: `Location ${finalLoc} is occupied by ${conflict.name}.` });
        }

        const updatedItem = {
            name: name.trim(),
            location: finalLoc,
            quantity: parsedQty,
            ...(isDepleted && { archivedAt: new Date() }) // Stamp depletion time
        };

        const result = await collection.findOneAndUpdate(
            { id: req.params.id },
            { $set: updatedItem, ...( !isDepleted && { $unset: { archivedAt: "" } } ) },
            { returnDocument: 'after' }
        );

        res.json(result);
    } catch (err) {
        res.status(500).json({ error: 'Could not update stock.' });
    }
});

module.exports = app;
// Start the server locally (ignored by Vercel)
if (require.main === module) {
    app.listen(PORT, '0.0.0.0', () => {
        console.log(`BOM Tracker running at http://localhost:${PORT}`);
    });
}