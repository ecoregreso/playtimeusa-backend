// server.js
require('dotenv').config();

const path = require('path');
const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const sqlite3 = require('sqlite3').verbose();
const jwt = require('jsonwebtoken');

const featureModules = require('./modules');

const PORT = process.env.PORT || 3000;
const DB_FILE = process.env.DB_FILE || path.join(__dirname, 'database.sqlite');
const FRONTEND_ORIGINS = process.env.FRONTEND_ORIGIN
  ? process.env.FRONTEND_ORIGIN.split(',').map(s => s.trim())
  : '*';
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret';
const ADMIN_KEY = process.env.ADMIN_KEY || 'dev-admin-key';

const app = express();
app.use(cors({ origin: FRONTEND_ORIGINS, credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// ---------- SQLite ----------
const db = new sqlite3.Database(DB_FILE);

// tiny promise helpers
const run = (sql, params = []) =>
  new Promise((resolve, reject) => db.run(sql, params, function (err) {
    if (err) reject(err); else resolve(this);
  }));
const get = (sql, params = []) =>
  new Promise((resolve, reject) => db.get(sql, params, (err, row) => {
    if (err) reject(err); else resolve(row);
  }));
const all = (sql, params = []) =>
  new Promise((resolve, reject) => db.all(sql, params, (err, rows) => {
    if (err) reject(err); else resolve(rows);
  }));

function genCode(n = 20) {
  // 128+ bits of entropy, A-Z0-9
  return crypto.randomBytes(n)
    .toString('base64url')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, n);
}

async function ensureFunBalanceColumn() {
  const cols = await all(`PRAGMA table_info('users')`);
  const has = cols?.some(c => c.name === 'fun_balance');
  if (!has) {
    await run(`ALTER TABLE users ADD COLUMN fun_balance INTEGER NOT NULL DEFAULT 0`);
  }
}

async function runMigrations() {
  await run(`PRAGMA journal_mode=WAL`);
  await run(`CREATE TABLE IF NOT EXISTS users(
    id INTEGER PRIMARY KEY,
    email TEXT,
    password_hash TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    fun_balance INTEGER NOT NULL DEFAULT 0
  )`);
  await ensureFunBalanceColumn();

  // Create a default test user if none exists
  const userCount = await get(`SELECT COUNT(*) as count FROM users`);
  if (userCount.count === 0) {
    await run(`INSERT INTO users(id, email) VALUES(1, 'player@playtimeusa.net')`);
  }

  await run(`CREATE TABLE IF NOT EXISTS vouchers(
    id INTEGER PRIMARY KEY,
    code TEXT NOT NULL UNIQUE,
    amount INTEGER NOT NULL,
    max_redemptions INTEGER NOT NULL DEFAULT 1,
    per_user_limit INTEGER NOT NULL DEFAULT 1,
    redeemed_count INTEGER NOT NULL DEFAULT 0,
    active INTEGER NOT NULL DEFAULT 1,
    expires_at DATETIME,
    created_by INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  await run(`CREATE TABLE IF NOT EXISTS voucher_redemptions(
    id INTEGER PRIMARY KEY,
    voucher_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    amount INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(voucher_id, user_id)
  )`);
  await run(`CREATE INDEX IF NOT EXISTS vr_voucher_idx ON voucher_redemptions(voucher_id)`);
  await run(`CREATE INDEX IF NOT EXISTS vr_user_idx ON voucher_redemptions(user_id)`);

  await run(`CREATE TABLE IF NOT EXISTS spins(
    id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL,
    bet INTEGER NOT NULL,
    win INTEGER NOT NULL,
    stops TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  for (const mod of featureModules) {
    if (mod && typeof mod.migrate === 'function') {
      await mod.migrate({ db, run, get, all });
    }
  }
}

// ---------- Auth ----------
function authUser(req, res, next) {
  const h = req.headers.authorization || '';
  if (h.startsWith('Bearer ')) {
    try {
      const payload = jwt.verify(h.slice(7), JWT_SECRET);
      if (payload && payload.id) {
        req.user = { id: Number(payload.id) };
        return next();
      }
    } catch (_) {
      // fall through to header fallback
    }
  }
  // Dev fallback: X-User-Id
  const uid = Number(req.headers['x-user-id']);
  if (Number.isInteger(uid) && uid > 0) {
    req.user = { id: uid };
    return next();
  }
  return res.status(401).json({ ok: false, error: 'unauthorized' });
}

function authAdmin(req, res, next) {
  const k = req.headers['x-admin-key'];
  if (k && k === ADMIN_KEY) return next();
  return res.status(401).json({ ok: false, error: 'admin_unauthorized' });
}

// ---------- Simple per-route rate limits ----------
const lastHit = new Map(); // key -> ts
function rateLimit(keyFn, ms) {
  return (req, res, next) => {
    const key = keyFn(req);
    const now = Date.now();
    const last = lastHit.get(key) || 0;
    if (now - last < ms) return res.status(429).json({ ok: false, error: 'rate_limited' });
    lastHit.set(key, now);
    next();
  };
}

// ---------- Health ----------
app.get('/health', (_req, res) => res.json({ ok: true }));

// ---------- Admin: issue voucher ----------
app.post('/api/cashier/voucher', authAdmin, async (req, res) => {
  try {
    const amount = req.body?.amount | 0;
    const max_redemptions = req.body?.max_redemptions ? req.body.max_redemptions | 0 : 1;
    const per_user_limit = req.body?.per_user_limit ? req.body.per_user_limit | 0 : 1;
    const expires_at = req.body?.expires_at ? new Date(req.body.expires_at).toISOString() : null;

    if (!Number.isInteger(amount) || amount <= 0) {
      return res.status(400).json({ ok: false, error: 'invalid_amount' });
    }
    if (max_redemptions <= 0 || per_user_limit <= 0) {
      return res.status(400).json({ ok: false, error: 'invalid_limits' });
    }

    const code = genCode(20);
    await run(
      `INSERT INTO vouchers(code, amount, max_redemptions, per_user_limit, expires_at)
       VALUES(?,?,?,?,?)`,
      [code, amount, max_redemptions, per_user_limit, expires_at]
    );
    res.json({ ok: true, code, amount, max_redemptions, per_user_limit, expires_at });
  } catch (e) {
    res.status(500).json({ ok: false, error: 'server_error' });
  }
});

// ---------- Player: get balance ----------
app.get('/api/balance', authUser, async (req, res) => {
  try {
    const row = await get(`SELECT fun_balance FROM users WHERE id = ?`, [req.user.id]);
    const bal = row?.fun_balance ?? 0;
    res.json({ ok: true, fun: bal });
  } catch {
    res.status(500).json({ ok: false, error: 'server_error' });
  }
});

// ---------- Player: redeem voucher ----------
app.post(
  '/api/voucher/redeem',
  authUser,
  rateLimit(req => `redeem:${req.user.id}`, 2000),
  async (req, res) => {
    const uid = req.user.id;
    const code = String(req.body?.code || '').trim().toUpperCase();
    if (!code) return res.status(400).json({ ok: false, error: 'invalid_code' });

    db.serialize(() => {
      db.run('BEGIN IMMEDIATE');
      db.get(
        `SELECT id, amount, active,
                COALESCE(max_redemptions,1) AS max_redemptions,
                COALESCE(per_user_limit,1) AS per_user_limit,
                COALESCE(redeemed_count,0) AS redeemed_count,
                expires_at
           FROM vouchers
          WHERE code = ?`,
        [code],
        (err, v) => {
          if (err) { db.run('ROLLBACK'); return res.status(500).json({ ok: false, error: 'db_error' }); }
          const now = Date.now();
          if (!v || !v.active || (v.expires_at && now >= Date.parse(v.expires_at))) {
            db.run('ROLLBACK'); return res.status(404).json({ ok: false, error: 'invalid_or_expired' });
          }
          if (v.redeemed_count >= v.max_redemptions) {
            db.run('ROLLBACK'); return res.status(409).json({ ok: false, error: 'exhausted' });
          }
          db.get(
            `SELECT COUNT(1) AS c FROM voucher_redemptions WHERE voucher_id=? AND user_id=?`,
            [v.id, uid],
            (e2, r) => {
              if (e2) { db.run('ROLLBACK'); return res.status(500).json({ ok: false, error: 'db_error' }); }
              if ((r?.c || 0) >= v.per_user_limit) {
                db.run('ROLLBACK'); return res.status(409).json({ ok: false, error: 'per_user_limit' });
              }
              db.run(
                `UPDATE users SET fun_balance = fun_balance + ? WHERE id=?`,
                [v.amount, uid],
                function (e3) {
                  if (e3 || !this.changes) { db.run('ROLLBACK'); return res.status(500).json({ ok: false, error: 'credit_failed' }); }
                  db.run(
                    `INSERT INTO voucher_redemptions(voucher_id,user_id,amount) VALUES(?,?,?)`,
                    [v.id, uid, v.amount],
                    (e4) => {
                      if (e4) { db.run('ROLLBACK'); return res.status(500).json({ ok: false, error: 'log_failed' }); }
                      db.run(
                        `UPDATE vouchers SET redeemed_count = redeemed_count + 1 WHERE id=?`,
                        [v.id],
                        (e5) => {
                          if (e5) { db.run('ROLLBACK'); return res.status(500).json({ ok: false, error: 'counter_failed' }); }
                          db.get(`SELECT fun_balance FROM users WHERE id=?`, [uid], (e6, u) => {
                            if (e6) { db.run('ROLLBACK'); return res.status(500).json({ ok: false, error: 'read_balance_failed' }); }
                            db.run('COMMIT');
                            return res.json({ ok: true, amount: v.amount, balance: u.fun_balance });
                          });
                        }
                      );
                    }
                  );
                }
              );
            }
          );
        }
      );
    });
  }
);

// ---------- Slot spin ----------
const SYMBOLS = [
  { k: 'A', w: 5, p: 5 },
  { k: 'B', w: 8, p: 3 },
  { k: 'C', w: 12, p: 2 },
  { k: 'D', w: 20, p: 1 }
];
const LINES = [
  [[0,0],[0,1],[0,2]],
  [[1,0],[1,1],[1,2]],
  [[2,0],[2,1],[2,2]],
  [[0,0],[1,1],[2,2]],
  [[2,0],[1,1],[0,2]],
];

function pickWeighted() {
  const total = SYMBOLS.reduce((s, x) => s + x.w, 0);
  let r = crypto.randomInt(total);
  for (const s of SYMBOLS) { if ((r -= s.w) < 0) return s.k; }
}
function spinMatrix() {
  return Array.from({ length: 3 }, () => Array.from({ length: 3 }, pickWeighted));
}
function calcWin(stops, bet) {
  let win = 0;
  for (const L of LINES) {
    const [a, b, c] = L.map(([r, c]) => stops[r][c]);
    if (a === b && b === c) {
      const sym = SYMBOLS.find(s => s.k === a);
      win += bet * (sym?.p || 0);
    }
  }
  return win;
}

app.post(
  '/api/spin',
  authUser,
  rateLimit(req => `spin:${req.user.id}`, 150),
  (req, res) => {
    const uid = req.user.id;
    const bet = req.body?.bet | 0;
    if (!Number.isInteger(bet) || bet < 1 || bet > 100000) {
      return res.status(400).json({ ok: false, error: 'invalid_bet' });
    }

    db.serialize(() => {
      db.run('BEGIN IMMEDIATE');

      db.run(
        `UPDATE users SET fun_balance = fun_balance - ? WHERE id=? AND fun_balance >= ?`,
        [bet, uid, bet],
        function (e1) {
          if (e1) { db.run('ROLLBACK'); return res.status(500).json({ ok: false, error: 'debit_failed' }); }
          if (!this.changes) { db.run('ROLLBACK'); return res.status(402).json({ ok: false, error: 'insufficient_funds' }); }

          const stops = spinMatrix();
          const win = calcWin(stops, bet);

          const credit = (cb) => {
            if (win > 0) {
              db.run(
                `UPDATE users SET fun_balance = fun_balance + ? WHERE id=?`,
                [win, uid],
                (e2) => cb(e2)
              );
            } else cb(null);
          };

          credit((e2) => {
            if (e2) { db.run('ROLLBACK'); return res.status(500).json({ ok: false, error: 'credit_failed' }); }

            db.run(
              `INSERT INTO spins(user_id, bet, win, stops) VALUES(?,?,?,?)`,
              [uid, bet, win, JSON.stringify(stops)],
              function (e3) {
                if (e3) { db.run('ROLLBACK'); return res.status(500).json({ ok: false, error: 'log_failed' }); }
                const roundId = this.lastID;
                db.get(`SELECT fun_balance FROM users WHERE id=?`, [uid], (e4, u) => {
                  if (e4) { db.run('ROLLBACK'); return res.status(500).json({ ok: false, error: 'read_balance_failed' }); }
                  db.run('COMMIT');
                  res.json({ ok: true, stops, win, balance: u.fun_balance, roundId });
                });
              }
            );
          });
        }
      );
    });
  }
);

for (const mod of featureModules) {
  if (mod && typeof mod.register === 'function') {
    mod.register(app, { db, run, get, all }, { authUser, authAdmin });
  }
}

// ---------- Static (optional) ----------
app.use('/', express.static(path.join(__dirname, 'public')));

// ---------- Boot ----------
runMigrations()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`playtime backend on :${PORT}`);
    });
  })
  .catch(err => {
    console.error('Migration failed', err);
    process.exit(1);
  });
