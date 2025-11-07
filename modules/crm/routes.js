const express = require('express');

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

function toInt(value, fallback = null) {
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? fallback : parsed;
}

module.exports = function createCrmRouter({ run, get, all }) {
  const router = express.Router();

  router.get('/segments', async (_req, res) => {
    try {
      const segments = await all(
        `SELECT s.*, COALESCE(m.member_count, 0) AS member_count
           FROM crm_segments s
           LEFT JOIN (
             SELECT segment_id, COUNT(*) AS member_count
               FROM crm_segment_members
              GROUP BY segment_id
           ) m ON m.segment_id = s.id
          ORDER BY s.created_at DESC`
      );
      res.json({ ok: true, segments });
    } catch (err) {
      console.error('[crm] failed to list segments', err);
      res.status(500).json({ ok: false, error: 'crm_segments_failed' });
    }
  });

  router.post('/segments', async (req, res) => {
    const { name, description = null, filters = null, members = [] } = req.body || {};
    if (!name || typeof name !== 'string') {
      return res.status(400).json({ ok: false, error: 'name_required' });
    }

    try {
      const insert = await run(
        `INSERT INTO crm_segments(name, description, filters) VALUES(?,?,?)`,
        [name.trim(), description, toSafeJson(filters)]
      );
      const segmentId = insert.lastID;

      if (Array.isArray(members)) {
        for (const memberId of members) {
          const userId = toInt(memberId);
          if (userId) {
            await run(
              `INSERT OR IGNORE INTO crm_segment_members(segment_id, user_id) VALUES(?,?)`,
              [segmentId, userId]
            );
          }
        }
      }

      res.status(201).json({ ok: true, segmentId });
    } catch (err) {
      console.error('[crm] failed to create segment', err);
      res.status(500).json({ ok: false, error: 'crm_create_segment_failed' });
    }
  });

  router.get('/segments/:id', async (req, res) => {
    const segmentId = toInt(req.params.id);
    if (!segmentId) {
      return res.status(400).json({ ok: false, error: 'invalid_segment' });
    }

    try {
      const segment = await get(`SELECT * FROM crm_segments WHERE id = ?`, [segmentId]);
      if (!segment) {
        return res.status(404).json({ ok: false, error: 'segment_not_found' });
      }
      const members = await all(
        `SELECT m.user_id, u.email, u.fun_balance
           FROM crm_segment_members m
           LEFT JOIN users u ON u.id = m.user_id
          WHERE m.segment_id = ?
          ORDER BY m.joined_at DESC`,
        [segmentId]
      );
      res.json({ ok: true, segment, members });
    } catch (err) {
      console.error('[crm] failed to load segment', err);
      res.status(500).json({ ok: false, error: 'crm_segment_load_failed' });
    }
  });

  router.patch('/segments/:id', async (req, res) => {
    const segmentId = toInt(req.params.id);
    if (!segmentId) {
      return res.status(400).json({ ok: false, error: 'invalid_segment' });
    }

    const updates = [];
    const params = [];

    if (Object.prototype.hasOwnProperty.call(req.body || {}, 'name')) {
      updates.push('name = ?');
      params.push(req.body.name);
    }
    if (Object.prototype.hasOwnProperty.call(req.body || {}, 'description')) {
      updates.push('description = ?');
      params.push(req.body.description);
    }
    if (Object.prototype.hasOwnProperty.call(req.body || {}, 'filters')) {
      updates.push('filters = ?');
      params.push(toSafeJson(req.body.filters));
    }

    if (!updates.length) {
      return res.status(400).json({ ok: false, error: 'no_updates' });
    }

    updates.push('updated_at = CURRENT_TIMESTAMP');

    try {
      const result = await run(
        `UPDATE crm_segments SET ${updates.join(', ')} WHERE id = ?`,
        [...params, segmentId]
      );
      if (!result.changes) {
        return res.status(404).json({ ok: false, error: 'segment_not_found' });
      }
      res.json({ ok: true });
    } catch (err) {
      console.error('[crm] failed to update segment', err);
      res.status(500).json({ ok: false, error: 'crm_segment_update_failed' });
    }
  });

  router.post('/segments/:id/members', async (req, res) => {
    const segmentId = toInt(req.params.id);
    const { userIds = [] } = req.body || {};

    if (!segmentId) {
      return res.status(400).json({ ok: false, error: 'invalid_segment' });
    }
    if (!Array.isArray(userIds) || !userIds.length) {
      return res.status(400).json({ ok: false, error: 'no_members' });
    }

    try {
      for (const id of userIds) {
        const userId = toInt(id);
        if (userId) {
          await run(
            `INSERT OR IGNORE INTO crm_segment_members(segment_id, user_id) VALUES(?, ?)`,
            [segmentId, userId]
          );
        }
      }
      res.json({ ok: true });
    } catch (err) {
      console.error('[crm] failed to add members', err);
      res.status(500).json({ ok: false, error: 'crm_add_members_failed' });
    }
  });

  router.delete('/segments/:id/members/:userId', async (req, res) => {
    const segmentId = toInt(req.params.id);
    const userId = toInt(req.params.userId);

    if (!segmentId || !userId) {
      return res.status(400).json({ ok: false, error: 'invalid_params' });
    }

    try {
      await run(
        `DELETE FROM crm_segment_members WHERE segment_id = ? AND user_id = ?`,
        [segmentId, userId]
      );
      res.json({ ok: true });
    } catch (err) {
      console.error('[crm] failed to remove member', err);
      res.status(500).json({ ok: false, error: 'crm_remove_member_failed' });
    }
  });

  router.get('/campaigns', async (_req, res) => {
    try {
      const campaigns = await all(
        `SELECT c.*, s.name AS segment_name,
                COALESCE(sent.sent_count, 0) AS sent_count,
                COALESCE(opened.opened_count, 0) AS opened_count,
                COALESCE(clicked.clicked_count, 0) AS clicked_count
           FROM crm_campaigns c
           LEFT JOIN crm_segments s ON s.id = c.segment_id
           LEFT JOIN (
             SELECT campaign_id, COUNT(*) AS sent_count
               FROM crm_campaign_events
              WHERE event_type = 'sent'
              GROUP BY campaign_id
           ) sent ON sent.campaign_id = c.id
           LEFT JOIN (
             SELECT campaign_id, COUNT(*) AS opened_count
               FROM crm_campaign_events
              WHERE event_type = 'opened'
              GROUP BY campaign_id
           ) opened ON opened.campaign_id = c.id
           LEFT JOIN (
             SELECT campaign_id, COUNT(*) AS clicked_count
               FROM crm_campaign_events
              WHERE event_type = 'clicked'
              GROUP BY campaign_id
           ) clicked ON clicked.campaign_id = c.id
          ORDER BY c.created_at DESC`
      );
      res.json({ ok: true, campaigns });
    } catch (err) {
      console.error('[crm] failed to list campaigns', err);
      res.status(500).json({ ok: false, error: 'crm_campaigns_failed' });
    }
  });

  router.post('/campaigns', async (req, res) => {
    const {
      name,
      segmentId = null,
      channel = 'email',
      subject = null,
      content = null,
      scheduledAt = null,
      status = 'draft'
    } = req.body || {};
    const normalizedSegmentId = segmentId == null ? null : toInt(segmentId);

    if (!name || typeof name !== 'string') {
      return res.status(400).json({ ok: false, error: 'name_required' });
    }

    try {
      const insert = await run(
        `INSERT INTO crm_campaigns(name, status, segment_id, channel, subject, content, scheduled_at)
         VALUES(?,?,?,?,?,?,?)`,
        [name.trim(), status, normalizedSegmentId, channel, subject, content, scheduledAt]
      );
      res.status(201).json({ ok: true, campaignId: insert.lastID });
    } catch (err) {
      console.error('[crm] failed to create campaign', err);
      res.status(500).json({ ok: false, error: 'crm_create_campaign_failed' });
    }
  });

  router.post('/campaigns/:id/schedule', async (req, res) => {
    const campaignId = toInt(req.params.id);
    const { scheduledAt, status = 'scheduled' } = req.body || {};

    if (!campaignId) {
      return res.status(400).json({ ok: false, error: 'invalid_campaign' });
    }

    try {
      const result = await run(
        `UPDATE crm_campaigns SET scheduled_at = ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [scheduledAt, status, campaignId]
      );
      if (!result.changes) {
        return res.status(404).json({ ok: false, error: 'campaign_not_found' });
      }
      res.json({ ok: true });
    } catch (err) {
      console.error('[crm] failed to schedule campaign', err);
      res.status(500).json({ ok: false, error: 'crm_schedule_failed' });
    }
  });

  router.post('/campaigns/:id/events', async (req, res) => {
    const campaignId = toInt(req.params.id);
    const { eventType, userId = null, metadata = null } = req.body || {};

    if (!campaignId || !eventType) {
      return res.status(400).json({ ok: false, error: 'invalid_event' });
    }

    try {
      const insert = await run(
        `INSERT INTO crm_campaign_events(campaign_id, user_id, event_type, metadata)
         VALUES(?,?,?,?)`,
        [campaignId, toInt(userId), eventType, toSafeJson(metadata)]
      );
      res.status(201).json({ ok: true, eventId: insert.lastID });
    } catch (err) {
      console.error('[crm] failed to log event', err);
      res.status(500).json({ ok: false, error: 'crm_event_failed' });
    }
  });

  router.get('/campaigns/:id/events', async (req, res) => {
    const campaignId = toInt(req.params.id);
    if (!campaignId) {
      return res.status(400).json({ ok: false, error: 'invalid_campaign' });
    }

    try {
      const events = await all(
        `SELECT e.id, e.user_id, u.email, e.event_type, e.metadata, e.created_at
           FROM crm_campaign_events e
           LEFT JOIN users u ON u.id = e.user_id
          WHERE e.campaign_id = ?
          ORDER BY e.created_at DESC`,
        [campaignId]
      );
      res.json({ ok: true, events });
    } catch (err) {
      console.error('[crm] failed to fetch events', err);
      res.status(500).json({ ok: false, error: 'crm_events_failed' });
    }
  });

  return router;
};
