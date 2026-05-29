import pg from 'pg';

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

const USERS = [
  { id: 'bonna',   name: 'Bønna',   color: '#22C55E' },
  { id: 'hakkern', name: 'Håkkern', color: '#EF4444' },
  { id: 'dunzter', name: 'Dunzter', color: '#3B82F6' },
  { id: 'schjell', name: 'Schjell', color: '#F59E0B' },
];

export const USERS_LIST = USERS;

export async function initSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id    TEXT PRIMARY KEY,
      name  TEXT NOT NULL,
      color TEXT NOT NULL
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
  `);

  // Seed fixed users
  for (const u of USERS) {
    await pool.query(
      `INSERT INTO users (id, name, color) VALUES ($1, $2, $3)
       ON CONFLICT (id) DO UPDATE SET name = $2, color = $3`,
      [u.id, u.name, u.color]
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

export async function getWeekResult(weekKey, seasonId) {
  const res = await pool.query(
    'SELECT * FROM week_results WHERE week_key = $1 AND season_id = $2',
    [weekKey, seasonId]
  );
  return res.rows[0] ?? null;
}
