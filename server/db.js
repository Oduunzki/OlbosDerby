import pg from 'pg';
import bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

const USERS = [
  { id: 'bonna',   name: 'Bønna',   color: '#22C55E', pinHash: '$2b$10$9/F0NHxJ8pxvQJaGPeXL7uU32eh2iCXKffN222Ld4p28Qtzr5Hvlm' },
  { id: 'hakkern', name: 'Håkkern', color: '#EF4444', pinHash: '$2b$10$VOCykMuBY2oZMv8Xzb/h3eNFiC8AAtlPEZ8yMjNdGmWrYwRK.vLYy' },
  { id: 'dunzter', name: 'Dunzter', color: '#3B82F6', pinHash: '$2b$10$.kxuHS9UZVk9XmRJLJ0FzuqRwjWkxzIBUS7IDOqeTKFT8DJKnVrbS' },
  { id: 'schjell', name: 'Schjell', color: '#F59E0B', pinHash: '$2b$10$BMUzZ5IFoEdr6rrnx4.wouVJmht0QdwigD9vn1H9QuWlNY/IPM5j.' },
];

export const USERS_LIST = USERS;

export async function initSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS races (
      id          TEXT PRIMARY KEY,
      name        TEXT NOT NULL,
      emoji       TEXT NOT NULL DEFAULT '🏇',
      description TEXT NOT NULL DEFAULT '',
      status      TEXT NOT NULL DEFAULT 'active',
      interval    TEXT NOT NULL DEFAULT 'week',
      start_date  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      end_date    TIMESTAMPTZ,
      created_by  TEXT,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS users (
      id         TEXT PRIMARY KEY,
      name       TEXT NOT NULL,
      color      TEXT NOT NULL,
      pin_hash   TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS seasons (
      id         TEXT PRIMARY KEY,
      year       INTEGER NOT NULL,
      quarter    INTEGER NOT NULL,
      start_date TEXT NOT NULL,
      active     BOOLEAN NOT NULL DEFAULT TRUE
    );

    CREATE TABLE IF NOT EXISTS balances (
      user_id   TEXT NOT NULL REFERENCES users(id),
      season_id TEXT NOT NULL REFERENCES seasons(id),
      amount    NUMERIC(10,2) NOT NULL DEFAULT 250,
      PRIMARY KEY (user_id, season_id)
    );

    CREATE TABLE IF NOT EXISTS bets (
      id         TEXT PRIMARY KEY,
      user_id    TEXT NOT NULL REFERENCES users(id),
      season_id  TEXT NOT NULL REFERENCES seasons(id),
      week_key   TEXT NOT NULL,
      horse      TEXT NOT NULL,
      amount     NUMERIC(10,2) NOT NULL,
      placed_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS week_results (
      week_key       TEXT NOT NULL,
      season_id      TEXT NOT NULL REFERENCES seasons(id),
      resolved_at    TIMESTAMPTZ,
      winning_horses JSONB NOT NULL DEFAULT '[]',
      total_pot      NUMERIC(10,2) NOT NULL DEFAULT 0,
      carryover_in   NUMERIC(10,2) NOT NULL DEFAULT 0,
      PRIMARY KEY (week_key, season_id)
    );

    CREATE TABLE IF NOT EXISTS prize_pool (
      season_id TEXT PRIMARY KEY REFERENCES seasons(id),
      amount    NUMERIC(10,2) NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token      TEXT PRIMARY KEY,
      user_id    TEXT NOT NULL REFERENCES users(id),
      expires_at TIMESTAMPTZ NOT NULL
    );

    CREATE TABLE IF NOT EXISTS price_history (
      id          BIGSERIAL PRIMARY KEY,
      ticker      TEXT NOT NULL,
      price       NUMERIC(12,4) NOT NULL,
      captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS week_positions (
      week_key  TEXT NOT NULL,
      season_id TEXT NOT NULL,
      stocks    JSONB NOT NULL DEFAULT '[]',
      shorts    JSONB NOT NULL DEFAULT '[]',
      saved_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (week_key, season_id)
    );

    CREATE TABLE IF NOT EXISTS positions (
      id         TEXT PRIMARY KEY,
      ticker     TEXT NOT NULL,
      buy_price  NUMERIC(12,4) NOT NULL,
      shares     NUMERIC(12,4),
      deadline   TEXT NOT NULL,
      color      TEXT NOT NULL,
      in_play    BOOLEAN NOT NULL DEFAULT TRUE,
      race_id    TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_price_history_ticker_time
      ON price_history (ticker, captured_at DESC);
  `);

  // Migrate: add pin_hash column if it was created before auth was added
  await pool.query(`
    ALTER TABLE users ADD COLUMN IF NOT EXISTS pin_hash TEXT NOT NULL DEFAULT '';
  `);

  // Migrate: add dark_horse column to week_positions
  await pool.query(`
    ALTER TABLE week_positions ADD COLUMN IF NOT EXISTS dark_horse JSONB;
  `);

  // Migrate: add sold_price column to positions
  await pool.query(`
    ALTER TABLE positions ADD COLUMN IF NOT EXISTS sold_price NUMERIC(12,4);
  `);

  // Migrate: add race-related columns to races table
  await pool.query(`
    ALTER TABLE races ADD COLUMN IF NOT EXISTS interval   TEXT NOT NULL DEFAULT 'week';
    ALTER TABLE races ADD COLUMN IF NOT EXISTS start_date TIMESTAMPTZ NOT NULL DEFAULT NOW();
    ALTER TABLE races ADD COLUMN IF NOT EXISTS end_date   TIMESTAMPTZ;
    ALTER TABLE races ADD COLUMN IF NOT EXISTS created_by TEXT;
    ALTER TABLE races ADD COLUMN IF NOT EXISTS locked     BOOLEAN NOT NULL DEFAULT FALSE;
    ALTER TABLE races ADD COLUMN IF NOT EXISTS repeating  BOOLEAN NOT NULL DEFAULT FALSE;
  `);

  // Migrate: add race_id to positions
  await pool.query(`
    ALTER TABLE positions ADD COLUMN IF NOT EXISTS race_id TEXT;
  `);

  // Assign existing positions without a race to main-derby
  await pool.query(`
    UPDATE positions SET race_id = 'main-derby' WHERE race_id IS NULL;
  `);

  // Seed fixed users (upsert PIN hash so it updates if changed)
  for (const u of USERS) {
    await pool.query(
      `INSERT INTO users (id, name, color, pin_hash) VALUES ($1, $2, $3, $4)
       ON CONFLICT (id) DO UPDATE SET name = $2, color = $3, pin_hash = $4`,
      [u.id, u.name, u.color, u.pinHash]
    );
  }
}

// ── Season helpers ────────────────────────────────────────────────────────────

function quarterFromDate(date) {
  return Math.floor(date.getMonth() / 3) + 1;
}

function seasonStartDate(year, quarter) {
  const month = (quarter - 1) * 3; // 0, 3, 6, 9
  return new Date(Date.UTC(year, month, 1)).toISOString().split('T')[0];
}

export async function ensureCurrentSeason() {
  const now = new Date();
  const year = now.getUTCFullYear();
  const quarter = quarterFromDate(now);
  const id = `${year}-Q${quarter}`;

  const existing = await pool.query('SELECT id FROM seasons WHERE id = $1', [id]);
  if (existing.rows.length > 0) return id;

  // Create season and deactivate others
  await pool.query('UPDATE seasons SET active = FALSE');
  await pool.query(
    `INSERT INTO seasons (id, year, quarter, start_date, active)
     VALUES ($1, $2, $3, $4, TRUE)`,
    [id, year, quarter, seasonStartDate(year, quarter)]
  );

  // Give each user 250 kr
  for (const u of USERS) {
    await pool.query(
      `INSERT INTO balances (user_id, season_id, amount) VALUES ($1, $2, 250)
       ON CONFLICT DO NOTHING`,
      [u.id, id]
    );
  }

  // Init prize pool
  await pool.query(
    `INSERT INTO prize_pool (season_id, amount) VALUES ($1, 0) ON CONFLICT DO NOTHING`,
    [id]
  );

  return id;
}

// ── Week helpers ──────────────────────────────────────────────────────────────

export function getCurrentWeekKey() {
  const now = new Date();
  const d = new Date(now);
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

export function getPreviousWeekKey() {
  const now = new Date();
  const prev = new Date(now);
  prev.setUTCDate(prev.getUTCDate() - 7);
  const d = new Date(prev);
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

// Returns the Friday 22:00 UTC of the given week key
function weekFridayClose(weekKey) {
  const [yearStr, wStr] = weekKey.split('-W');
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
  friday.setUTCHours(22, 0, 0, 0); // 22:00 UTC = midnight CEST
  return friday;
}

export function isWeekClosed(weekKey) {
  return Date.now() > weekFridayClose(weekKey).getTime();
}

// ── State query ───────────────────────────────────────────────────────────────

export async function getState() {
  const seasonId = await ensureCurrentSeason();
  const weekKey = getCurrentWeekKey();

  const [usersRes, balancesRes, betsRes, poolRes, historyRes] = await Promise.all([
    pool.query('SELECT id, name, color FROM users ORDER BY id'),
    pool.query('SELECT user_id, amount FROM balances WHERE season_id = $1', [seasonId]),
    pool.query('SELECT id, user_id, horse, amount, placed_at FROM bets WHERE season_id = $1 AND week_key = $2 ORDER BY placed_at', [seasonId, weekKey]),
    pool.query('SELECT amount FROM prize_pool WHERE season_id = $1', [seasonId]),
    pool.query(
      `SELECT week_key, resolved_at, winning_horses, total_pot, carryover_in
       FROM week_results WHERE season_id = $1 ORDER BY week_key DESC LIMIT 10`,
      [seasonId]
    ),
  ]);

  const balances = {};
  for (const row of balancesRes.rows) balances[row.user_id] = parseFloat(row.amount);

  return {
    seasonId,
    weekKey,
    users: usersRes.rows,
    balances,
    weekBets: betsRes.rows.map(b => ({ ...b, amount: parseFloat(b.amount) })),
    prizePool: parseFloat(poolRes.rows[0]?.amount ?? 0),
    history: historyRes.rows.map(r => ({
      ...r,
      total_pot: parseFloat(r.total_pot),
      carryover_in: parseFloat(r.carryover_in),
    })),
  };
}

// ── Bet CRUD ──────────────────────────────────────────────────────────────────

export async function placeBet(userId, seasonId, weekKey, horse, amount) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const balRes = await client.query(
      'SELECT amount FROM balances WHERE user_id = $1 AND season_id = $2 FOR UPDATE',
      [userId, seasonId]
    );
    const balance = parseFloat(balRes.rows[0]?.amount ?? 0);
    if (balance < amount) throw new Error('Insufficient balance');

    const id = `${userId}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    await client.query(
      `INSERT INTO bets (id, user_id, season_id, week_key, horse, amount) VALUES ($1,$2,$3,$4,$5,$6)`,
      [id, userId, seasonId, weekKey, horse, amount]
    );
    await client.query(
      'UPDATE balances SET amount = amount - $1 WHERE user_id = $2 AND season_id = $3',
      [amount, userId, seasonId]
    );

    await client.query('COMMIT');
    return id;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function removeBet(betId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const betRes = await client.query(
      'SELECT user_id, season_id, week_key, amount FROM bets WHERE id = $1',
      [betId]
    );
    if (betRes.rows.length === 0) throw new Error('Bet not found');
    const { user_id, season_id, week_key, amount } = betRes.rows[0];

    if (isWeekClosed(week_key)) throw new Error('Week already closed');

    await client.query('DELETE FROM bets WHERE id = $1', [betId]);
    await client.query(
      'UPDATE balances SET amount = amount + $1 WHERE user_id = $2 AND season_id = $3',
      [amount, user_id, season_id]
    );

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// ── Week resolution ───────────────────────────────────────────────────────────

export async function resolveWeek(weekKey, seasonId, winningHorses) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Idempotency check
    const existing = await client.query(
      'SELECT resolved_at FROM week_results WHERE week_key = $1 AND season_id = $2',
      [weekKey, seasonId]
    );
    if (existing.rows.length > 0 && existing.rows[0].resolved_at) {
      await client.query('ROLLBACK');
      return;
    }

    const betsRes = await client.query(
      'SELECT id, user_id, horse, amount FROM bets WHERE week_key = $1 AND season_id = $2',
      [weekKey, seasonId]
    );
    const bets = betsRes.rows.map(b => ({ ...b, amount: parseFloat(b.amount) }));
    const weekTotal = bets.reduce((s, b) => s + b.amount, 0);

    const poolRes = await client.query(
      'SELECT amount FROM prize_pool WHERE season_id = $1 FOR UPDATE',
      [seasonId]
    );
    const carryover = parseFloat(poolRes.rows[0]?.amount ?? 0);
    const totalPot = weekTotal + carryover;

    const winningBets = bets.filter(b => winningHorses.includes(b.horse));
    const winningTotal = winningBets.reduce((s, b) => s + b.amount, 0);

    if (winningBets.length > 0 && totalPot > 0) {
      for (const bet of winningBets) {
        const share = winningTotal > 0
          ? (bet.amount / winningTotal) * totalPot
          : totalPot / winningBets.length;
        await client.query(
          'UPDATE balances SET amount = amount + $1 WHERE user_id = $2 AND season_id = $3',
          [share, bet.user_id, seasonId]
        );
      }
      await client.query('UPDATE prize_pool SET amount = 0 WHERE season_id = $1', [seasonId]);
    } else {
      // No winners — carry over to prize pool
      await client.query(
        'UPDATE prize_pool SET amount = amount + $1 WHERE season_id = $2',
        [weekTotal, seasonId]
      );
    }

    await client.query(
      `INSERT INTO week_results (week_key, season_id, resolved_at, winning_horses, total_pot, carryover_in)
       VALUES ($1, $2, NOW(), $3, $4, $5)
       ON CONFLICT (week_key, season_id) DO UPDATE
         SET resolved_at = NOW(), winning_horses = $3, total_pot = $4, carryover_in = $5`,
      [weekKey, seasonId, JSON.stringify(winningHorses), totalPot, carryover]
    );

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function resetBalances(seasonId) {
  for (const u of USERS) {
    await pool.query(
      'UPDATE balances SET amount = 250 WHERE user_id = $1 AND season_id = $2',
      [u.id, seasonId]
    );
  }
}

export async function getWeekResult(weekKey, seasonId) {
  const res = await pool.query(
    'SELECT * FROM week_results WHERE week_key = $1 AND season_id = $2',
    [weekKey, seasonId]
  );
  return res.rows[0] ?? null;
}

// ── Price history ─────────────────────────────────────────────────────────────

export async function savePrices(priceMap) {
  const entries = Object.entries(priceMap).filter(([, p]) => typeof p === 'number');
  if (entries.length === 0) return;
  const placeholders = entries.map((_, i) => `($${i * 2 + 1}, $${i * 2 + 2}, NOW())`).join(', ');
  const values = entries.flatMap(([ticker, price]) => [ticker, price]);
  await pool.query(
    `INSERT INTO price_history (ticker, price, captured_at) VALUES ${placeholders}`,
    values
  );
}

export async function getLatestPrices(tickers) {
  if (tickers.length === 0) return {};
  const res = await pool.query(
    `SELECT DISTINCT ON (ticker) ticker, price
     FROM price_history
     WHERE ticker = ANY($1)
     ORDER BY ticker, captured_at DESC`,
    [tickers]
  );
  const out = {};
  for (const row of res.rows) out[row.ticker] = parseFloat(row.price);
  return out;
}

export async function getPriceHistory(tickers, from) {
  const res = await pool.query(
    `SELECT ticker, price, captured_at
     FROM price_history
     WHERE ticker = ANY($1) AND captured_at >= $2
     ORDER BY ticker, captured_at ASC`,
    [tickers, from]
  );
  // Group by ticker
  const out = {};
  for (const row of res.rows) {
    if (!out[row.ticker]) out[row.ticker] = [];
    out[row.ticker].push({ date: row.captured_at, close: parseFloat(row.price) });
  }
  return out;
}

export async function saveWeekPositions(weekKey, seasonId, stocks, shorts, darkHorse) {
  await pool.query(
    `INSERT INTO week_positions (week_key, season_id, stocks, shorts, dark_horse)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (week_key, season_id) DO UPDATE SET stocks = $3, shorts = $4, dark_horse = $5, saved_at = NOW()`,
    [weekKey, seasonId, JSON.stringify(stocks), JSON.stringify(shorts), JSON.stringify(darkHorse ?? null)]
  );
}

export async function getWeekPositions(weekKey, seasonId) {
  const res = await pool.query(
    'SELECT stocks, shorts, dark_horse FROM week_positions WHERE week_key = $1 AND season_id = $2',
    [weekKey, seasonId]
  );
  if (res.rows.length === 0) return null;
  return { stocks: res.rows[0].stocks, shorts: res.rows[0].shorts, darkHorse: res.rows[0].dark_horse };
}

export async function getReplayPriceHistory(tickers, from, to) {
  if (tickers.length === 0) return {};
  const res = await pool.query(
    `SELECT DISTINCT ON (ticker, date_trunc('hour', captured_at))
       ticker,
       price,
       date_trunc('hour', captured_at) AS hour
     FROM price_history
     WHERE ticker = ANY($1)
       AND captured_at >= $2
       AND captured_at <= $3
     ORDER BY ticker, date_trunc('hour', captured_at), captured_at DESC`,
    [tickers, from, to ?? new Date()]
  );
  const out = {};
  for (const row of res.rows) {
    if (!out[row.ticker]) out[row.ticker] = [];
    out[row.ticker].push({ date: row.hour.toISOString(), close: parseFloat(row.price) });
  }
  return out;
}

export async function getBetsForWeek(weekKey, seasonId) {
  const res = await pool.query(
    'SELECT id, user_id, horse, amount FROM bets WHERE week_key = $1 AND season_id = $2 ORDER BY placed_at',
    [weekKey, seasonId]
  );
  return res.rows.map(b => ({ ...b, amount: parseFloat(b.amount) }));
}

export async function getHistoricalPrices(tickers, beforeDate) {
  if (tickers.length === 0) return {};
  const res = await pool.query(
    `SELECT DISTINCT ON (ticker) ticker, price
     FROM price_history
     WHERE ticker = ANY($1) AND captured_at <= $2
     ORDER BY ticker, captured_at DESC`,
    [tickers, beforeDate]
  );
  const out = {};
  for (const row of res.rows) out[row.ticker] = parseFloat(row.price);
  return out;
}

// ── Auth (with in-memory fallback when DB unavailable) ────────────────────────

let dbAvailable = true;
const memSessions = new Map(); // token → { userId, expires }

export function setDbAvailable(v) { dbAvailable = v; }
export function isDbAvailable() { return dbAvailable; }

export async function login(userId, pin) {
  if (dbAvailable) {
    try {
      const res = await pool.query('SELECT pin_hash FROM users WHERE id = $1', [userId]);
      if (res.rows.length === 0) throw new Error('User not found');
      const valid = await bcrypt.compare(pin, res.rows[0].pin_hash);
      if (!valid) throw new Error('Wrong PIN');
      const token = randomBytes(32).toString('hex');
      const expires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      await pool.query(
        'INSERT INTO sessions (token, user_id, expires_at) VALUES ($1, $2, $3)',
        [token, userId, expires]
      );
      return token;
    } catch (err) {
      if (err.message === 'User not found' || err.message === 'Wrong PIN') throw err;
      // DB connection failure — fall through to in-memory
    }
  }
  // In-memory fallback using hard-coded USERS list
  const user = USERS.find(u => u.id === userId);
  if (!user) throw new Error('User not found');
  const valid = await bcrypt.compare(pin, user.pinHash);
  if (!valid) throw new Error('Wrong PIN');
  const token = randomBytes(32).toString('hex');
  memSessions.set(token, { userId, expires: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) });
  return token;
}

export async function validateSession(token) {
  if (!token) return null;
  if (dbAvailable) {
    try {
      const res = await pool.query(
        'SELECT user_id FROM sessions WHERE token = $1 AND expires_at > NOW()',
        [token]
      );
      return res.rows[0]?.user_id ?? null;
    } catch {
      // Fall through to in-memory
    }
  }
  const s = memSessions.get(token);
  if (!s || s.expires < new Date()) return null;
  return s.userId;
}

export async function logout(token) {
  memSessions.delete(token);
  if (dbAvailable) {
    try { await pool.query('DELETE FROM sessions WHERE token = $1', [token]); } catch { /* ignore */ }
  }
}

// ── Races + Positions (horses) ───────────────────────────────────────────────

export function calculateEndDate(interval) {
  const now = new Date();
  if (interval === 'intra-day') {
    const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 22, 0, 0));
    if (Date.now() >= end.getTime()) {
      end.setUTCDate(end.getUTCDate() + 1);
      while (end.getUTCDay() === 0 || end.getUTCDay() === 6) end.setUTCDate(end.getUTCDate() + 1);
    }
    return end;
  }
  if (interval === 'week') {
    const d = new Date(now);
    d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 22, 0, 0));
  }
  if (interval === 'quarter') {
    const quarterEndMonth = Math.floor(now.getUTCMonth() / 3) * 3 + 2;
    const lastDay = new Date(Date.UTC(now.getUTCFullYear(), quarterEndMonth + 1, 0));
    return new Date(Date.UTC(lastDay.getUTCFullYear(), lastDay.getUTCMonth(), lastDay.getUTCDate(), 22, 0, 0));
  }
  return null;
}

const DEFAULT_RACES = [
  { id: 'main-derby', name: 'The Olbos Derby', emoji: '🏇', description: 'Swing trading long positions — bet on rockets', interval: 'week', locked: true, repeating: true },
];

export async function seedDefaultRaces() {
  const endDate = calculateEndDate('week');
  for (const r of DEFAULT_RACES) {
    await pool.query(
      `INSERT INTO races (id, name, emoji, description, interval, start_date, end_date, locked, repeating)
       VALUES ($1,$2,$3,$4,$5,NOW(),$6,$7,$8)
       ON CONFLICT (id) DO UPDATE SET locked = $7, repeating = $8`,
      [r.id, r.name, r.emoji, r.description, r.interval, endDate, r.locked, r.repeating]
    ).catch(() => {});
  }
}

// In-memory store for no-DB mode
const mem = {
  races: DEFAULT_RACES.map(r => ({
    ...r, status: 'active', position_count: 0,
    start_date: new Date().toISOString(),
    end_date: calculateEndDate(r.interval)?.toISOString() ?? null,
    created_by: null, created_at: new Date().toISOString(),
  })),
  positions: [],      // { ...position, race_id }
  positionsSeeded: false,
};

function toPositionRow(r) {
  return {
    id: r.id, ticker: r.ticker,
    buyPrice: parseFloat(r.buy_price ?? r.buyPrice),
    ...(r.shares != null ? { shares: parseFloat(r.shares) } : {}),
    deadline: r.deadline, color: r.color,
    inPlay: r.in_play ?? r.inPlay ?? true,
    ...(r.sold_price != null ? { soldPrice: parseFloat(r.sold_price) } : {}),
    ...(r.sold_price == null && r.soldPrice != null ? { soldPrice: r.soldPrice } : {}),
    raceId: r.race_id ?? r.raceId ?? null,
  };
}

// ── Positions (horses) ────────────────────────────────────────────────────────

export async function getPositions(raceId = null) {
  if (dbAvailable) {
    try {
      const res = raceId
        ? await pool.query('SELECT * FROM positions WHERE race_id = $1 ORDER BY created_at ASC', [raceId])
        : await pool.query('SELECT * FROM positions ORDER BY created_at ASC');
      return res.rows.map(toPositionRow);
    } catch { /* fall through */ }
  }
  return raceId ? mem.positions.filter(p => p.raceId === raceId) : [...mem.positions];
}

export async function addPosition({ id, ticker, buyPrice, shares, deadline, color, inPlay, raceId }) {
  if (dbAvailable) {
    try {
      await pool.query(
        `INSERT INTO positions (id, ticker, buy_price, shares, deadline, color, in_play, race_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [id, ticker, buyPrice, shares ?? null, deadline, color, inPlay ?? true, raceId ?? null]
      );
      return;
    } catch { /* fall through */ }
  }
  mem.positions.push({ id, ticker, buyPrice, ...(shares != null ? { shares } : {}), deadline, color, inPlay: inPlay ?? true, raceId: raceId ?? null });
}

export async function removePosition(id) {
  if (dbAvailable) {
    try { await pool.query('DELETE FROM positions WHERE id = $1', [id]); return; } catch { /* fall through */ }
  }
  const idx = mem.positions.findIndex(p => p.id === id);
  if (idx !== -1) mem.positions.splice(idx, 1);
}

export async function sellPosition(id, soldPrice) {
  if (dbAvailable) {
    try { await pool.query('UPDATE positions SET sold_price = $1 WHERE id = $2', [soldPrice, id]); return; } catch { /* fall through */ }
  }
  const p = mem.positions.find(p => p.id === id);
  if (p) p.soldPrice = soldPrice;
}

export async function setInPlay(id, inPlay) {
  if (dbAvailable) {
    try { await pool.query('UPDATE positions SET in_play = $1 WHERE id = $2', [inPlay, id]); return; } catch { /* fall through */ }
  }
  const p = mem.positions.find(p => p.id === id);
  if (p) p.inPlay = inPlay;
}

export async function seedPositionsFromJson(stocks, defaultRaceId = 'main-derby') {
  if (dbAvailable) {
    try {
      const res = await pool.query('SELECT COUNT(*) FROM positions');
      if (parseInt(res.rows[0].count) > 0) return;
      for (const s of stocks) {
        await addPosition({ id: s.id, ticker: s.ticker, buyPrice: s.buyPrice, shares: s.shares, deadline: s.deadline, color: s.color, inPlay: s.inPlay ?? true, raceId: defaultRaceId });
      }
      console.log(`[positions] seeded ${stocks.length} positions from stocks.json`);
      return;
    } catch { /* fall through */ }
  }
  if (!mem.positionsSeeded) {
    mem.positions = stocks.map(s => ({ id: s.id, ticker: s.ticker, buyPrice: s.buyPrice, ...(s.shares != null ? { shares: s.shares } : {}), deadline: s.deadline, color: s.color, inPlay: s.inPlay ?? true, raceId: defaultRaceId, ...(s.soldPrice != null ? { soldPrice: s.soldPrice } : {}) }));
    mem.positionsSeeded = true;
    console.log(`[positions] seeded ${stocks.length} positions in memory`);
  }
}

async function closeExpiredRaces() {
  const now = new Date();
  if (dbAvailable) {
    try {
      // Find repeating races about to be closed so we can spawn next edition
      const expiredRepeating = await pool.query(
        `SELECT * FROM races WHERE status = 'active' AND repeating = TRUE AND end_date IS NOT NULL AND end_date < $1`,
        [now]
      );
      for (const r of expiredRepeating.rows) {
        const existing = await pool.query(
          `SELECT id FROM races WHERE status = 'active' AND repeating = TRUE AND name = $1 AND id != $2`,
          [r.name, r.id]
        );
        if (existing.rows.length === 0) {
          const newId = `${r.id}-${Date.now()}`;
          const newEnd = calculateEndDate(r.interval);
          await pool.query(
            `INSERT INTO races (id, name, emoji, description, interval, start_date, end_date, locked, repeating, created_by)
             VALUES ($1,$2,$3,$4,$5,NOW(),$6,$7,$8,$9) ON CONFLICT DO NOTHING`,
            [newId, r.name, r.emoji, r.description, r.interval, newEnd, r.locked, r.repeating, r.created_by]
          );
          console.log(`[races] spawned next edition of "${r.name}": ${newId}`);
        }
      }
      await pool.query(
        `UPDATE races SET status = 'closed' WHERE status = 'active' AND end_date IS NOT NULL AND end_date < $1`,
        [now]
      );
    } catch { /* ignore */ }
  } else {
    for (const r of mem.races) {
      if (r.status !== 'active' || !r.end_date || new Date(r.end_date) >= now) continue;
      if (r.repeating) {
        const hasNext = mem.races.some(x => x.status === 'active' && x.repeating && x.name === r.name && x.id !== r.id);
        if (!hasNext) {
          const newEnd = calculateEndDate(r.interval);
          mem.races.push({
            ...r, id: `${r.id}-${Date.now()}`,
            status: 'active', position_count: 0,
            start_date: now.toISOString(),
            end_date: newEnd?.toISOString() ?? null,
            created_at: now.toISOString(),
          });
        }
      }
      r.status = 'closed';
    }
  }
}

export async function getRaces() {
  await closeExpiredRaces();
  if (dbAvailable) {
    try {
      const res = await pool.query(`
        SELECT r.*, COUNT(p.id)::int AS position_count
        FROM races r
        LEFT JOIN positions p ON p.race_id = r.id
        GROUP BY r.id
        ORDER BY r.created_at ASC
      `);
      return res.rows;
    } catch { /* fall through */ }
  }
  return mem.races;
}

export async function createRace({ id, name, emoji, description, interval, createdBy, locked = false, repeating = false }) {
  const endDate = calculateEndDate(interval ?? 'week');
  if (dbAvailable) {
    try {
      await pool.query(
        `INSERT INTO races (id, name, emoji, description, interval, start_date, end_date, created_by, locked, repeating)
         VALUES ($1,$2,$3,$4,$5,NOW(),$6,$7,$8,$9)`,
        [id, name, emoji ?? '🏇', description ?? '', interval ?? 'week', endDate, createdBy ?? null, locked, repeating]
      );
      return;
    } catch { /* fall through */ }
  }
  if (!mem.races.find(r => r.id === id)) {
    mem.races.push({
      id, name, emoji: emoji ?? '🏇', description: description ?? '',
      interval: interval ?? 'week', status: 'active', position_count: 0,
      locked, repeating,
      start_date: new Date().toISOString(),
      end_date: endDate?.toISOString() ?? null,
      created_by: createdBy ?? null, created_at: new Date().toISOString(),
    });
  }
}

export async function deleteRace(id) {
  if (dbAvailable) {
    try {
      const res = await pool.query('SELECT locked FROM races WHERE id = $1', [id]);
      if (res.rows[0]?.locked) throw new Error('Race is locked');
      await pool.query('DELETE FROM races WHERE id = $1', [id]);
      return;
    } catch (err) { if (err.message === 'Race is locked') throw err; /* else fall through */ }
  }
  const idx = mem.races.findIndex(r => r.id === id);
  if (idx !== -1) {
    if (mem.races[idx].locked) throw new Error('Race is locked');
    mem.races.splice(idx, 1);
  }
}

export async function updateRace(id, { name, emoji, description }) {
  if (dbAvailable) {
    try {
      const sets = [], vals = [];
      if (name        != null) { sets.push(`name        = $${sets.length + 1}`); vals.push(name); }
      if (emoji       != null) { sets.push(`emoji       = $${sets.length + 1}`); vals.push(emoji); }
      if (description != null) { sets.push(`description = $${sets.length + 1}`); vals.push(description); }
      if (sets.length === 0) return;
      vals.push(id);
      await pool.query(`UPDATE races SET ${sets.join(', ')} WHERE id = $${vals.length}`, vals);
      return;
    } catch { /* fall through */ }
  }
  const r = mem.races.find(r => r.id === id);
  if (!r) return;
  if (name        != null) r.name        = name;
  if (emoji       != null) r.emoji       = emoji;
  if (description != null) r.description = description;
}

