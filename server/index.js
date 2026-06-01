import express from 'express';
import cors from 'cors';
import fetch from 'node-fetch';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync } from 'fs';
import YahooFinance from 'yahoo-finance2';
import * as db from './db.js';

const yahooFinance = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function loadCurrentPositions() {
  try {
    const stocks = JSON.parse(readFileSync(join(__dirname, '../src/data/stocks.json'), 'utf8'));
    const shortsFile = JSON.parse(readFileSync(join(__dirname, '../src/data/shorts.json'), 'utf8'));
    return {
      stocks: Array.isArray(stocks) ? stocks : [],
      shorts: shortsFile.positions ?? [],
      darkHorse: shortsFile.darkHorse ?? null,
    };
  } catch {
    return { stocks: [], shorts: [], darkHorse: null };
  }
}

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

async function fetchYahooPriceRaw(ticker) {
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
      console.warn(`[prices] ${ticker} raw fetch error:`, err.message);
    }
  }
  return null;
}

async function fetchYahooPrice(ticker) {
  try {
    const quote = await yahooFinance.quote(ticker, {}, { validateResult: false });
    const price = quote?.regularMarketPrice ?? null;
    if (typeof price === 'number') return price;
  } catch (err) {
    console.warn(`[prices] ${ticker} yahoo-finance2 error:`, err.message);
  }
  return fetchYahooPriceRaw(ticker);
}

app.get('/api/prices', async (req, res) => {
  const { tickers } = req.query;
  if (!tickers || typeof tickers !== 'string') return res.json({});

  const tickerList = tickers.split(',').map(t => t.trim().toUpperCase()).filter(Boolean).slice(0, 20);
  const results = {};

  await Promise.all(tickerList.map(async (ticker) => {
    results[ticker] = await fetchYahooPrice(ticker);
  }));

  // Fill any nulls with last known DB price as fallback
  const nullTickers = tickerList.filter(t => results[t] == null);
  if (nullTickers.length > 0) {
    try {
      const cached = await db.getLatestPrices(nullTickers);
      for (const t of nullTickers) {
        if (cached[t] != null) {
          results[t] = cached[t];
          console.log(`[prices] ${t} using cached price ${cached[t]}`);
        }
      }
    } catch (err) {
      console.warn('[prices] DB fallback error:', err.message);
    }
  }

  res.json(results);

  // Persist to DB in the background (don't await — don't block the response)
  db.savePrices(results).catch(err => console.error('[prices] DB save error:', err.message));
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

// Stored price history (DB-backed, falls back to Yahoo Finance)
app.get('/api/price-history', async (req, res) => {
  const { tickers, from } = req.query;
  if (!tickers || !from || typeof tickers !== 'string' || typeof from !== 'string') {
    return res.json({});
  }
  try {
    const tickerList = tickers.split(',').map(t => t.trim().toUpperCase()).filter(Boolean);
    const history = await db.getPriceHistory(tickerList, new Date(from));
    res.json(history);
  } catch (err) {
    console.error('[price-history]', err.message);
    res.status(500).json({});
  }
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

// Lazy resolution: called when state is fetched and the previous week may be unresolved
async function maybeResolveLastWeek() {
  const prevWeekKey = db.getPreviousWeekKey();
  if (!db.isWeekClosed(prevWeekKey)) return;

  try {
    const state = await db.getState();
    const existing = await db.getWeekResult(prevWeekKey, state.seasonId);
    if (existing?.resolved_at) return;

    // Get saved positions for that week (saved when server started with that week's data)
    const saved = await db.getWeekPositions(prevWeekKey, state.seasonId);
    const stocks = saved?.stocks ?? [];
    const shorts = saved?.shorts ?? [];

    // Get prices at or near Friday close of that week
    const allTickers = [
      ...stocks.map(s => s.ticker),
      ...shorts.map(s => s.yahooSymbol ?? s.ticker),
    ];
    if (allTickers.length === 0) return;

    // weekFridayClose for previous week
    const [yearStr, wStr] = prevWeekKey.split('-W');
    const year = parseInt(yearStr);
    const week = parseInt(wStr);
    const jan4 = new Date(Date.UTC(year, 0, 4));
    const dayOfWeek = jan4.getUTCDay() || 7;
    const week1Monday = new Date(jan4);
    week1Monday.setUTCDate(jan4.getUTCDate() - dayOfWeek + 1);
    const targetMonday = new Date(week1Monday);
    targetMonday.setUTCDate(week1Monday.getUTCDate() + (week - 1) * 7);
    const friday = new Date(targetMonday);
    friday.setUTCDate(targetMonday.getUTCDate() + 4);
    friday.setUTCHours(22, 0, 0, 0);

    const prices = await db.getHistoricalPrices(allTickers, friday);
    const winners = await detectWinners(prices, stocks, shorts);
    await db.resolveWeek(prevWeekKey, state.seasonId, winners);
    console.log(`[betting] auto-resolved ${prevWeekKey}: winners=${JSON.stringify(winners)}`);
  } catch (err) {
    console.error('[betting] auto-resolve failed:', err.message);
  }
}

app.get('/api/betting/state', requireAuth, async (req, res) => {
  try {
    await maybeResolveLastWeek();
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

// Admin: reset all balances to 250
app.post('/api/betting/admin/reset-balances', requireAuth, async (req, res) => {
  try {
    const state = await db.getState();
    await db.resetBalances(state.seasonId);
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Admin: seed positions for a past week (for backfilling)
app.post('/api/betting/admin/seed-positions', requireAuth, async (req, res) => {
  try {
    const { weekKey, stocks, shorts, darkHorse } = req.body;
    if (!weekKey) return res.status(400).json({ error: 'weekKey required' });
    const state = await db.getState();
    await db.saveWeekPositions(weekKey, state.seasonId, stocks ?? [], shorts ?? [], darkHorse ?? null);
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

app.get('/api/betting/bets/:weekKey', requireAuth, async (req, res) => {
  try {
    const state = await db.getState();
    const bets = await db.getBetsForWeek(req.params.weekKey, state.seasonId);
    res.json(bets);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/replay/:weekKey', requireAuth, async (req, res) => {
  try {
    const state = await db.getState();
    const { weekKey } = req.params;

    const saved = await db.getWeekPositions(weekKey, state.seasonId);
    if (!saved) return res.status(404).json({ error: 'No positions saved for this week' });

    const allPositions = [...(saved.stocks ?? []), ...(saved.shorts ?? [])];
    const tickers = allPositions.map(p => (p.yahooSymbol ?? p.ticker).toUpperCase());

    // Compute Monday of the week as start date
    const [yearStr, wStr] = weekKey.split('-W');
    const year = parseInt(yearStr);
    const week = parseInt(wStr);
    const jan4 = new Date(Date.UTC(year, 0, 4));
    const dow = jan4.getUTCDay() || 7;
    const week1Mon = new Date(jan4);
    week1Mon.setUTCDate(jan4.getUTCDate() - dow + 1);
    const monday = new Date(week1Mon);
    monday.setUTCDate(week1Mon.getUTCDate() + (week - 1) * 7);
    monday.setUTCHours(13, 30, 0, 0); // NYSE open on Monday
    const friday = new Date(monday);
    friday.setUTCDate(monday.getUTCDate() + 4);
    friday.setUTCHours(22, 0, 0, 0);

    const priceHistory = await db.getReplayPriceHistory(tickers, monday, friday);

    res.json({
      weekKey,
      positions: allPositions,
      darkHorse: saved.darkHorse,
      priceHistory,
    });
  } catch (err) {
    console.error('[replay]', err.message);
    res.status(500).json({ error: err.message });
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
  .then(async (seasonId) => {
    const weekKey = db.getCurrentWeekKey();
    const { stocks, shorts, darkHorse } = loadCurrentPositions();
    await db.saveWeekPositions(weekKey, seasonId, stocks, shorts, darkHorse);
    app.listen(PORT, () => {
      console.log(`HeiaStock Derby running on http://localhost:${PORT}`);
    });
  })
  .catch(err => {
    console.error('DB init failed:', err.message);
    db.setDbAvailable(false);
    app.listen(PORT, () => {
      console.log(`HeiaStock Derby running on http://localhost:${PORT} (no DB)`);
    });
  });
