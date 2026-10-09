import express from 'express';
import compression from 'compression';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDashboard } from './src/dashboard.js';

const app = express();
app.use(compression());
app.use(express.static(path.join(path.dirname(fileURLToPath(import.meta.url)), 'public')));

const TTL_MS = (Number(process.env.CACHE_TTL_SECONDS) || 300) * 1000;
let cached = null;
let cachedAt = 0;
let inflight = null;

app.get('/api/dashboard', async (req, res) => {
  try {
    const force = req.query.refresh === '1';
    if (!force && cached && Date.now() - cachedAt < TTL_MS) return res.json(cached);
    if (!inflight) {
      inflight = buildDashboard().finally(() => {
        inflight = null;
      });
    }
    cached = await inflight;
    cachedAt = Date.now();
    res.json(cached);
  } catch (e) {
    console.error(e);
    res.status(500).json({ erro: e.message });
  }
});

const port = Number(process.env.API_PORT) || 3001;
const host = process.env.API_HOST || '127.0.0.1';
app.listen(port, host, (err) => {
  if (err) {
    console.error(`Não foi possível iniciar em ${host}:${port}: ${err.message}`);
    process.exit(1);
  }
  console.log(`Quality Fix Analytics em http://${host}:${port}`);
});
