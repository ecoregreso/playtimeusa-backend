-- users fun balance
ALTER TABLE users ADD COLUMN fun_balance INTEGER NOT NULL DEFAULT 0;

-- voucher redemptions audit
CREATE TABLE IF NOT EXISTS voucher_redemptions(
  id INTEGER PRIMARY KEY,
  voucher_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  amount INTEGER NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(voucher_id, user_id)
);

-- slot spins log
CREATE TABLE IF NOT EXISTS spins(
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL,
  bet INTEGER NOT NULL,
  win INTEGER NOT NULL,
  stops TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
