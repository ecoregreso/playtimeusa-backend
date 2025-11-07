js
New
+351-0
const express = require('express');
const crypto = require('crypto');

function toInt(value, fallback = null) {
  const n = Number.parseInt(value, 10);
  return Number.isNaN(n) ? fallback : n;
}

function toSafeJson(value) {
  if (value == null) return null;
  try {
    if (typeof value === 'string') {
      JSON.parse(value);
      return value;
    }
    return JSON.stringify(value);
  } catch (err) {
    return null;
  }
}

module.exports = function createPamRouter({ run, get, all }) {
  const router = express.Router();

  router.get('/players', async (_req, res) => {
    try {
      const players = await all(
        `SELECT u.id, u.email, u.fun_balance, u.created_at,
                p.display_name, p.status, p.vip_level, p.currency, p.locale, p.phone, p.birthdate,
                p.updated_at
           FROM users u
           LEFT JOIN pam_profiles p ON p.user_id = u.id
          ORDER BY u.created_at DESC`
      );
      res.json({ ok: true, players });
    } catch (err) {
      console.error('[pam] failed to list players', err);
      res.status(500).json({ ok: false, error: 'pam_list_failed' });
    }
  });

  router.post('/players', async (req, res) => {
    const { email, password, displayName, status = 'active', vipLevel = 0, currency = 'FUN', locale = 'en-US', phone = null, birthdate = null } = req.body || {};

    if (!email || typeof email !== 'string') {
      return res.status(400).json({ ok: false, error: 'email_required' });
    }

    const normalizedStatus = typeof status === 'string' ? status : 'active';
    const normalizedVip = toInt(vipLevel, 0);
    const hashedPassword = password
      ? crypto.createHash('sha256').update(password).digest('hex')
      : null;

    try {
      const insertUser = await run(
        `INSERT INTO users(email, password_hash, fun_balance) VALUES(?,?,0)`,
        [email.trim(), hashedPassword]
      );
      const userId = insertUser.lastID;

      await run(
        `INSERT OR REPLACE INTO pam_profiles(user_id, display_name, status, vip_level, currency, locale, phone, birthdate)
         VALUES(?,?,?,?,?,?,?,?)`,
        [
          userId,
          displayName || email,
          normalizedStatus,
          normalizedVip ?? 0,
          currency || 'FUN',
          locale || 'en-US',
          phone || null,
          birthdate || null
        ]
      );

      res.status(201).json({ ok: true, playerId: userId });
    } catch (err) {
      if (String(err?.message || '').includes('UNIQUE constraint failed')) {
        return res.status(409).json({ ok: false, error: 'email_exists' });
      }
      console.error('[pam] failed to create player', err);
      res.status(500).json({ ok: false, error: 'pam_create_failed' });
    }
  });

  router.get('/players/:id', async (req, res) => {
    const playerId = toInt(req.params.id);
    if (!playerId) {
      return res.status(400).json({ ok: false, error: 'invalid_player' });
    }

    try {
      const player = await get(
        `SELECT u.id, u.email, u.fun_balance, u.created_at,
                p.display_name, p.status, p.vip_level, p.currency, p.locale, p.phone, p.birthdate,
                p.updated_at
           FROM users u
           LEFT JOIN pam_profiles p ON p.user_id = u.id
          WHERE u.id = ?`,
        [playerId]
      );

      if (!player) {
        return res.status(404).json({ ok: false, error: 'player_not_found' });
      }

      const sessions = await all(
        `SELECT id, started_at, ended_at, device, ip_address, status, metadata
           FROM pam_sessions
          WHERE user_id = ?
          ORDER BY started_at DESC
          LIMIT 50`,
        [playerId]
      );

      const walletHistory = await all(
        `SELECT id, type, amount, balance_before, balance_after, reason, metadata, created_at
           FROM pam_wallet_transactions
          WHERE user_id = ?
          ORDER BY created_at DESC
          LIMIT 50`,
        [playerId]
      );

      res.json({ ok: true, player, sessions, walletHistory });
    } catch (err) {
      console.error('[pam] failed to load player', err);
      res.status(500).json({ ok: false, error: 'pam_load_failed' });
    }
  });

  router.patch('/players/:id/profile', async (req, res) => {
    const playerId = toInt(req.params.id);
    if (!playerId) {
      return res.status(400).json({ ok: false, error: 'invalid_player' });
    }

    const updates = [];
    const params = [];
    const allowed = {
      display_name: 'displayName',
      status: 'status',
      vip_level: 'vipLevel',
      currency: 'currency',
      locale: 'locale',
      phone: 'phone',
      birthdate: 'birthdate'
    };

    for (const [column, key] of Object.entries(allowed)) {
      if (Object.prototype.hasOwnProperty.call(req.body || {}, key)) {
        let value = req.body[key];
        if (key === 'vipLevel') {
          value = toInt(value, 0);
        }
        updates.push(`${column} = ?`);
        params.push(value ?? null);
      }
    }

    if (!updates.length) {
      return res.status(400).json({ ok: false, error: 'no_updates' });
    }

    updates.push(`updated_at = CURRENT_TIMESTAMP`);

    try {
      await run(
        `INSERT INTO pam_profiles(user_id) VALUES(?) ON CONFLICT(user_id) DO NOTHING`,
        [playerId]
      );
      await run(
        `UPDATE pam_profiles SET ${updates.join(', ')} WHERE user_id = ?`,
        [...params, playerId]
      );
      res.json({ ok: true });
    } catch (err) {
      console.error('[pam] failed to update profile', err);
      res.status(500).json({ ok: false, error: 'pam_update_failed' });
    }
  });

  router.post('/players/:id/wallet-adjustments', async (req, res) => {
    const playerId = toInt(req.params.id);
    const { amount, type, reason = null, metadata = null } = req.body || {};
    const normalizedAmount = toInt(amount);

    if (!playerId) {
      return res.status(400).json({ ok: false, error: 'invalid_player' });
    }
    if (!normalizedAmount || normalizedAmount <= 0) {
      return res.status(400).json({ ok: false, error: 'invalid_amount' });
    }

    const adjType = type === 'debit' ? 'debit' : 'credit';

    try {
      await run('BEGIN IMMEDIATE');
      const player = await get(`SELECT fun_balance FROM users WHERE id = ?`, [playerId]);
      if (!player) {
        await run('ROLLBACK');
        return res.status(404).json({ ok: false, error: 'player_not_found' });
      }

      const currentBalance = Number(player.fun_balance ?? 0);
      const delta = adjType === 'credit' ? normalizedAmount : -normalizedAmount;
      const nextBalance = currentBalance + delta;

      if (nextBalance < 0) {
        await run('ROLLBACK');
        return res.status(400).json({ ok: false, error: 'insufficient_funds' });
      }

      await run(`UPDATE users SET fun_balance = ? WHERE id = ?`, [nextBalance, playerId]);
      await run(
        `INSERT INTO pam_wallet_transactions(user_id, type, amount, balance_before, balance_after, reason, metadata)
         VALUES(?,?,?,?,?,?,?)`,
        [
          playerId,
          adjType,
          normalizedAmount,
          currentBalance,
          nextBalance,
          reason || null,
          toSafeJson(metadata)
        ]
      );
      await run('COMMIT');

      res.json({ ok: true, balance: nextBalance });
    } catch (err) {
      console.error('[pam] wallet adjustment failed', err);
      try {
        await run('ROLLBACK');
      } catch (_) {
        // ignore rollback errors
      }
      res.status(500).json({ ok: false, error: 'pam_wallet_failed' });
    }
  });

  router.get('/players/:id/wallet-history', async (req, res) => {
    const playerId = toInt(req.params.id);
    if (!playerId) {
      return res.status(400).json({ ok: false, error: 'invalid_player' });
    }

    try {
      const history = await all(
        `SELECT id, type, amount, balance_before, balance_after, reason, metadata, created_at
           FROM pam_wallet_transactions
          WHERE user_id = ?
          ORDER BY created_at DESC
          LIMIT 200`,
        [playerId]
      );
      res.json({ ok: true, history });
    } catch (err) {
      console.error('[pam] failed to fetch wallet history', err);
      res.status(500).json({ ok: false, error: 'pam_wallet_history_failed' });
    }
  });

  router.post('/players/:id/sessions', async (req, res) => {
    const playerId = toInt(req.params.id);
    const { device = null, ipAddress = null, metadata = null, status = 'active', startedAt = null } = req.body || {};

    if (!playerId) {
      return res.status(400).json({ ok: false, error: 'invalid_player' });
    }

    try {
      const insert = await run(
        `INSERT INTO pam_sessions(user_id, started_at, device, ip_address, status, metadata)
         VALUES(?,?,?,?,?,?)`,
        [
          playerId,
          startedAt || null,
          device || null,
          ipAddress || null,
          status || 'active',
          toSafeJson(metadata)
        ]
      );
      res.status(201).json({ ok: true, sessionId: insert.lastID });
    } catch (err) {
      console.error('[pam] failed to create session', err);
      res.status(500).json({ ok: false, error: 'pam_session_failed' });
    }
  });

  router.get('/players/:id/sessions', async (req, res) => {
    const playerId = toInt(req.params.id);
    if (!playerId) {
      return res.status(400).json({ ok: false, error: 'invalid_player' });
    }

    try {
      const sessions = await all(
        `SELECT id, started_at, ended_at, device, ip_address, status, metadata
           FROM pam_sessions
          WHERE user_id = ?
          ORDER BY started_at DESC
          LIMIT 200`,
        [playerId]
      );
      res.json({ ok: true, sessions });
    } catch (err) {
      console.error('[pam] failed to fetch sessions', err);
      res.status(500).json({ ok: false, error: 'pam_sessions_failed' });
    }
  });

  router.patch('/sessions/:sessionId/close', async (req, res) => {
    const sessionId = toInt(req.params.sessionId);
    const { endedAt = new Date().toISOString(), status = 'closed' } = req.body || {};
    const hasMetadata = Object.prototype.hasOwnProperty.call(req.body || {}, 'metadata');
    const metadataValue = hasMetadata ? toSafeJson(req.body.metadata) : undefined;

    if (!sessionId) {
      return res.status(400).json({ ok: false, error: 'invalid_session' });
    }

    try {
      const updates = ['ended_at = ?', 'status = ?'];
      const params = [endedAt, status || 'closed'];

      if (hasMetadata) {
        updates.push('metadata = ?');
        params.push(metadataValue);
      } else {
        updates.push("metadata = COALESCE(metadata, '{}')");
      }

      const result = await run(
        `UPDATE pam_sessions SET ${updates.join(', ')} WHERE id = ?`,
        [...params, sessionId]
      );
      if (!result.changes) {
        return res.status(404).json({ ok: false, error: 'session_not_found' });
      }
      res.json({ ok: true });
    } catch (err) {
      console.error('[pam] failed to close session', err);
      res.status(500).json({ ok: false, error: 'pam_close_session_failed' });
    }
  });

  return router;
};
