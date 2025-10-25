const router = require('express').Router();

// expects req.user.id set by your auth middleware
module.exports = ({ db }) => {
  router.post('/voucher/redeem', async (req, res) => {
    const uid = req.user?.id;
    const code = String(req.body?.code||'').trim().toUpperCase();
    if (!uid) return res.status(401).json({ ok:false, error:'unauthorized' });
    if (!code) return res.status(400).json({ ok:false, error:'invalid_code' });

    try {
      db.serialize(() => {
        db.run('BEGIN IMMEDIATE');
        db.get(`
          SELECT id, amount,
                 COALESCE(max_redemptions,1) AS max_redemptions,
                 COALESCE(per_user_limit,1) AS per_user_limit,
                 COALESCE(redeemed_count,0) AS redeemed_count,
                 COALESCE(active,1) AS active,
                 expires_at
          FROM vouchers
          WHERE code = ?`, [code], (err, v) => {
          if (err) { db.run('ROLLBACK'); return res.status(500).json({ ok:false, error:'db_error' }); }
          const now = Date.now();
          if (!v || !v.active || (v.expires_at && now >= Date.parse(v.expires_at))) {
            db.run('ROLLBACK'); return res.status(404).json({ ok:false, error:'invalid_or_expired' });
          }
          if (v.redeemed_count >= v.max_redemptions) {
            db.run('ROLLBACK'); return res.status(409).json({ ok:false, error:'exhausted' });
          }
          db.get(`SELECT COUNT(1) AS c FROM voucher_redemptions WHERE voucher_id=? AND user_id=?`,
            [v.id, uid], (e2, r) => {
            if (e2) { db.run('ROLLBACK'); return res.status(500).json({ ok:false, error:'db_error' }); }
            if ((r?.c||0) >= v.per_user_limit) {
              db.run('ROLLBACK'); return res.status(409).json({ ok:false, error:'per_user_limit' });
            }
            db.run(`UPDATE users SET fun_balance = fun_balance + ? WHERE id=?`, [v.amount, uid], function (e3) {
              if (e3 || !this.changes) { db.run('ROLLBACK'); return res.status(500).json({ ok:false, error:'credit_failed' }); }
              db.run(`INSERT INTO voucher_redemptions(voucher_id,user_id,amount) VALUES(?,?,?)`, [v.id, uid, v.amount], (e4)=>{
                if (e4) { db.run('ROLLBACK'); return res.status(500).json({ ok:false, error:'log_failed' }); }
                db.run(`UPDATE vouchers SET redeemed_count = redeemed_count + 1 WHERE id=?`, [v.id], (e5)=>{
                  if (e5) { db.run('ROLLBACK'); return res.status(500).json({ ok:false, error:'counter_failed' }); }
                  db.get(`SELECT fun_balance FROM users WHERE id=?`, [uid], (e6, u)=>{
                    if (e6) { db.run('ROLLBACK'); return res.status(500).json({ ok:false, error:'read_balance_failed' }); }
                    db.run('COMMIT');
                    return res.json({ ok:true, amount: v.amount, balance: u.fun_balance });
                  });
                });
              });
            });
          });
        });
      });
    } catch {
      try { db.run('ROLLBACK'); } catch {}
      res.status(500).json({ ok:false, error:'unexpected' });
    }
  });

  return router;
};
