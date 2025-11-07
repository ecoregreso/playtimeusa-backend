+14-0
// server.js
require('dotenv').config();

const path = require('path');
const fs = require('fs');
const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const sqlite3 = require('sqlite3').verbose();
const jwt = require('jsonwebtoken');

const featureModules = require('./modules');

const PORT = process.env.PORT || 3000;
const DB_FILE = process.env.DB_FILE || path.join(__dirname, 'database.sqlite');
const ORIGINS = process.env.FRONTEND_ORIGIN 
  ? process.env.FRONTEND_ORIGIN.split(',').map(s => s.trim())
  : '*';
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret';
const ADMIN_KEY = process.env.ADMIN_KEY || 'dev-admin-key';

const app = express();
app.use(cors({ origin: ORIGINS, credentials: true }));
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
@@ -83,50 +85,56 @@ async function runMigrations() {
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

@@ -332,39 +340,45 @@ app.post(
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
