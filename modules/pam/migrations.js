const PAM_PROFILE_TABLE = `CREATE TABLE IF NOT EXISTS pam_profiles (
  user_id INTEGER PRIMARY KEY,
  display_name TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  vip_level INTEGER NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'FUN',
  locale TEXT DEFAULT 'en-US',
  birthdate TEXT,
  phone TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(user_id) REFERENCES users(id)
)`;

const PAM_SESSIONS_TABLE = `CREATE TABLE IF NOT EXISTS pam_sessions (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL,
  started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  ended_at DATETIME,
  device TEXT,
  ip_address TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  metadata TEXT,
  FOREIGN KEY(user_id) REFERENCES users(id)
)`;

const PAM_WALLET_TX_TABLE = `CREATE TABLE IF NOT EXISTS pam_wallet_transactions (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL,
  type TEXT NOT NULL,
  amount INTEGER NOT NULL,
  balance_before INTEGER NOT NULL,
  balance_after INTEGER NOT NULL,
  reason TEXT,
  metadata TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(user_id) REFERENCES users(id)
)`;

module.exports = async function runPamMigrations({ run }) {
  await run(PAM_PROFILE_TABLE);
  await run(PAM_SESSIONS_TABLE);
  await run(PAM_WALLET_TX_TABLE);
};
