import express from 'express';
import cors from 'cors';
import fetch from 'node-fetch';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import * as db from './db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json());

const YF_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.5',
  'Accept-Encoding': 'gzip, deflate, br',
  'Cache-Control': 'no-cache',
  'Pragma': 'no-cache',
};

async function yfFetch(url, timeoutMs = 10000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { headers: YF_HEADERS, signal: controller.signal });
    return res;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchYahooPrice(ticker) {
  // Try query2 first (generally less rate-limited for server IPs), fall back to query1
  const urls = [
    `https://query2.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=1d`,
    `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=1d`,
  ];
  for (const url of urls) {
    try {
      const res = await yfFetch(url);
      if (!res.ok) {
        console.warn(`[prices] ${ticker} ${url.includes('query2') ? 'query2' : 'query1'} → HTTP ${res.status}`);
        continue;
      }
      const data = await res.json();
      const price = data?.chart?.result?.[0]?.meta?.regularMarketPrice ?? null;
      if (typeof price === 'number') return price;
    } catch (err) {
      console.warn(`[prices] ${ticker} fetch error:`, err.message);
    }
  }
  return null;
}

app.get('/api/prices', async (req, res) => {
  const { tickers } = req.query;
  if (!tickers || typeof tickers !== 'string') return res.json({});

  const tickerList = tickers.split(',').map(t => t.trim().toUpperCase()).filter(Boolean).slice(0, 20);
  const results = {};

  await Promise.all(tickerList.map(async (ticker) => {
    results[ticker] = await fetchYahooPrice(ticker);
  }));

  res.json(results);
});

app.get('/api/history', async (req, res) => {
  const { tickers, from } = req.query;
  if (!tickers || !from || typeof tickers !== 'string' || typeof from !== 'string') {
    return res.json({});
  }

  const tickerList = tickers.split(',').map(t => t.trim().toUpperCase()).filter(Boolean).slice(0, 20);
  const period1 = Math.floor(new Date(from).getTime() / 1000);
  const period2 = Math.floor(Date.now() / 1000);

  const results = {};

  await Promise.all(
    tickerList.map(async (ticker) => {
      try {
        const url = `https://query2.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1h&period1=${period1}&period2=${period2}`;
        const response = await yfFetch(url, 12000);
        if (!response.ok) { results[ticker] = []; return; }
        const data = await response.json();
        const result = data?.chart?.result?.[0];
        if (!result) { results[ticker] = []; return; }

        const timestamps = result.timestamp ?? [];
        const closes = result.indicators?.quote?.[0]?.close ?? [];

        results[ticker] = timestamps
          .map((ts, i) => ({
            date: new Date(ts * 1000).toISOString(),
            close: closes[i] ?? null,
          }))
          .filter(d => d.close != null);
      } catch {
        results[ticker] = [];
      }
    })
  );

  res.json(results);
});

// Health check
app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));

// ── Auth routes ───────────────────────────────────────────────────────────────

app.post('/api/auth/login', async (req, res) => {
  try {
    const { userId, pin } = req.body;
    if (!userId || !pin) return res.status(400).json({ error: 'userId and pin required' });
    const token = await db.login(userId, String(pin));
    res.json({ token, userId });
  } catch (err) {
    res.status(401).json({ error: err.message });
  }
});

app.post('/api/auth/logout', async (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (token) await db.logout(token);
  res.json({ ok: true });
});

app.get('/api/auth/me', async (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  const userId = await db.validateSession(token);
  if (!userId) return res.status(401).json({ error: 'Not authenticated' });
  res.json({ userId });
});

// Middleware: require valid session for betting routes
async function requireAuth(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  const userId = await db.validateSession(token);
  if (!userId) return res.status(401).json({ error: 'Not authenticated' });
  req.userId = userId;
  next();
}

// ── Betting API ───────────────────────────────────────────────────────────────

// Determine winning horses from current prices + stock data
async function detectWinners(prices, stocks, shorts) {
  const winners = [];
  for (const s of stocks) {
    const price = prices[s.ticker];
    if (price != null && price > s.buyPrice) winners.push(s.ticker);
  }
  for (const s of shorts) {
    const price = prices[s.yahooSymbol] ?? prices[s.ticker];
    if (price != null && price < s.buyPrice) winners.push(s.ticker);
  }
  return winners;
}

// Lazy resolution: called when state is fetched and the last week may be unresolved
async function maybeResolveLastWeek(seasonId, stocks, shorts) {
  const weekKey = db.getCurrentWeekKey();
  if (!db.isWeekClosed(weekKey)) return;

  const existing = await db.getWeekResult(weekKey, seasonId);
  if (existing?.resolved_at) return;

  try {
    const allTickers = [
      ...stocks.map(s => s.ticker),
      ...shorts.map(s => s.yahooSymbol),
    ].join(',');
    const priceRes = await fetch(
      `http://localhost:${PORT}/api/prices?tickers=${encodeURIComponent(allTickers)}`
    );
    const prices = await priceRes.json();
    const winners = await detectWinners(prices, stocks, shorts);
    await db.resolveWeek(weekKey, seasonId, winners);
    console.log(`[betting] resolved ${weekKey}: winners=${JSON.stringify(winners)}`);
  } catch (err) {
    console.error('[betting] auto-resolve failed:', err.message);
  }
}

app.get('/api/betting/state', requireAuth, async (req, res) => {
  try {
    const state = await db.getState();
    res.json(state);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/betting/bet', requireAuth, async (req, res) => {
  try {
    const { userId, horse, amount } = req.body;
    if (!userId || !horse || !amount || amount <= 0) {
      return res.status(400).json({ error: 'userId, horse and amount required' });
    }
    const state = await db.getState();
    if (db.isWeekClosed(state.weekKey)) {
      return res.status(400).json({ error: 'Betting closed for this week' });
    }
    const betId = await db.placeBet(userId, state.seasonId, state.weekKey, horse, amount);
    res.json({ betId });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.delete('/api/betting/bet/:id', requireAuth, async (req, res) => {
  try {
    await db.removeBet(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Manual resolve (admin override — picks winners explicitly or auto-detects)
app.post('/api/betting/admin/resolve', requireAuth, async (req, res) => {
  try {
    const { weekKey, winningHorses } = req.body;
    const state = await db.getState();
    const wk = weekKey ?? state.weekKey;
    await db.resolveWeek(wk, state.seasonId, winningHorses ?? []);
    res.json({ ok: true, weekKey: wk, winningHorses: winningHorses ?? [] });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Serve Vite build in production
const distPath = join(__dirname, '../dist');
app.use(express.static(distPath));
app.use((_req, res) => {
  res.sendFile(join(distPath, 'index.html'));
});

const PORT = Number(process.env.PORT) || 4000;

db.initSchema()
  .then(() => db.ensureCurrentSeason())
  .then(() => {
    app.listen(PORT, () => {
      console.log(`HeiaStock Derby running on http://localhost:${PORT}`);
    });
  })
  .catch(err => {
    console.error('DB init failed:', err.message);
    // Start anyway so the race track still works without DB
    app.listen(PORT, () => {
      console.log(`HeiaStock Derby running on http://localhost:${PORT} (no DB)`);
    });
  });
