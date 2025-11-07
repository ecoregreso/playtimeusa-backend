New
+49-0
const CRM_SEGMENTS_TABLE = `CREATE TABLE IF NOT EXISTS crm_segments (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  filters TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
)`;

const CRM_SEGMENT_MEMBERS_TABLE = `CREATE TABLE IF NOT EXISTS crm_segment_members (
  id INTEGER PRIMARY KEY,
  segment_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(segment_id, user_id),
  FOREIGN KEY(segment_id) REFERENCES crm_segments(id),
  FOREIGN KEY(user_id) REFERENCES users(id)
)`;

const CRM_CAMPAIGNS_TABLE = `CREATE TABLE IF NOT EXISTS crm_campaigns (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  segment_id INTEGER,
  channel TEXT NOT NULL DEFAULT 'email',
  subject TEXT,
  content TEXT,
  scheduled_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(segment_id) REFERENCES crm_segments(id)
)`;

const CRM_CAMPAIGN_EVENTS_TABLE = `CREATE TABLE IF NOT EXISTS crm_campaign_events (
  id INTEGER PRIMARY KEY,
  campaign_id INTEGER NOT NULL,
  user_id INTEGER,
  event_type TEXT NOT NULL,
  metadata TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(campaign_id) REFERENCES crm_campaigns(id)
)`;

module.exports = async function runCrmMigrations({ run }) {
  await run(CRM_SEGMENTS_TABLE);
  await run(CRM_SEGMENT_MEMBERS_TABLE);
  await run(CRM_CAMPAIGNS_TABLE);
  await run(CRM_CAMPAIGN_EVENTS_TABLE);
};
