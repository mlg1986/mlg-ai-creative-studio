import express from 'express';
import bodyParser from 'body-parser';
import cors from 'cors';
import { getDb, dbRun, dbGet, dbAll } from './db.js';

const app = express();
const PORT = 3001;

app.use(cors());
app.use(bodyParser.json({ limit: '50mb' })); // Large limit for base64 images

// --- CONFIG API --- //
app.get('/api/config/key', async (req, res) => {
    try {
        const row = await dbGet("SELECT value FROM config WHERE key = ?", ['GEMINI_API_KEY']);
        res.json({ hasKey: !!row?.value, key: row?.value || null });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/config/key', async (req, res) => {
    const { key } = req.body;
    try {
        await dbRun("INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)", ['GEMINI_API_KEY', key]);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// --- PRODUCTS API --- //
app.get('/api/products', async (req, res) => {
    try {
        const rows = await dbAll("SELECT * FROM products");
        const products = rows.map(r => ({ ...r, images: JSON.parse(r.images), selected: !!r.selected }));
        res.json(products);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/products', async (req, res) => {
    const { id, name, specs, images, selected } = req.body;
    try {
        await dbRun(
            "INSERT OR REPLACE INTO products (id, name, specs, images, selected) VALUES (?, ?, ?, ?, ?)",
            [id, name, specs, JSON.stringify(images), selected ? 1 : 0]
        );
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/products/:id', async (req, res) => {
    try {
        await dbRun("DELETE FROM products WHERE id = ?", [req.params.id]);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
