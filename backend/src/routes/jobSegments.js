const express = require('express');
const pool = require('../db');
const requireAuth = require('../middleware/auth');

const router = express.Router();

const VALID_STATES = ['travel', 'work', 'pause'];

// Start a segment for a job (travel/work/pause). Requires an open time
// entry (clocked in) and no other active segment — finish the current job
// first before starting another.
router.post('/', requireAuth, async (req, res) => {
  const { job_id, state = 'travel' } = req.body;

  if (!job_id) {
    return res.status(400).json({ error: 'job_id is required' });
  }
  if (!VALID_STATES.includes(state)) {
    return res.status(400).json({ error: `state must be one of: ${VALID_STATES.join(', ')}` });
  }

  try {
    const timeEntryResult = await pool.query(
      `SELECT id FROM time_entries WHERE user_id = $1 AND clock_out_at IS NULL`,
      [req.user.userId]
    );
    if (timeEntryResult.rows.length === 0) {
      return res.status(409).json({ error: 'Clock in before selecting a job' });
    }
    const timeEntryId = timeEntryResult.rows[0].id;

    const activeResult = await pool.query(
      `SELECT id FROM job_segments WHERE time_entry_id = $1 AND ended_at IS NULL`,
      [timeEntryId]
    );
    if (activeResult.rows.length > 0) {
      return res.status(409).json({ error: 'Finish the current job before starting another' });
    }

    const jobResult = await pool.query(`SELECT id FROM jobs WHERE id = $1`, [job_id]);
    if (jobResult.rows.length === 0) {
      return res.status(404).json({ error: 'Job not found' });
    }

    const assignmentResult = await pool.query(
      `SELECT 1 FROM job_assignments
       WHERE job_id = $1 AND user_id = $2
       LIMIT 1`,
      [job_id, req.user.userId]
    );
    if (assignmentResult.rows.length === 0) {
      return res.status(403).json({ error: 'You are not assigned to this job' });
    }

    const result = await pool.query(
      `INSERT INTO job_segments (time_entry_id, job_id, user_id, state, started_at)
       VALUES ($1, $2, $3, $4, now())
       RETURNING id, job_id, state, started_at`,
      [timeEntryId, job_id, req.user.userId, state]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to start job segment' });
  }
});

// Transition the caller's active segment to a new state (travel/work/pause)
// on the same job: closes the current segment and opens a new one.
router.patch('/current', requireAuth, async (req, res) => {
  const { state } = req.body;

  if (!VALID_STATES.includes(state)) {
    return res.status(400).json({ error: `state must be one of: ${VALID_STATES.join(', ')}` });
  }

  try {
    const activeResult = await pool.query(
      `SELECT js.id, js.time_entry_id, js.job_id
       FROM job_segments js
       JOIN time_entries te ON te.id = js.time_entry_id
       WHERE te.user_id = $1 AND js.ended_at IS NULL`,
      [req.user.userId]
    );
    if (activeResult.rows.length === 0) {
      return res.status(409).json({ error: 'No active job segment' });
    }
    const active = activeResult.rows[0];

    await pool.query(`UPDATE job_segments SET ended_at = now() WHERE id = $1`, [active.id]);

    const result = await pool.query(
      `INSERT INTO job_segments (time_entry_id, job_id, user_id, state, started_at)
       VALUES ($1, $2, $3, $4, now())
       RETURNING id, job_id, state, started_at`,
      [active.time_entry_id, active.job_id, req.user.userId, state]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to transition job segment' });
  }
});

// Finish the caller's active segment: closes it, no new segment opens. The
// tech can then select another job (new travel segment) or clock out.
router.post('/current/finish', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `UPDATE job_segments js SET ended_at = now()
       FROM time_entries te
       WHERE js.time_entry_id = te.id
         AND te.user_id = $1
         AND js.ended_at IS NULL
       RETURNING js.id, js.job_id, js.state, js.started_at, js.ended_at`,
      [req.user.userId]
    );
    if (result.rows.length === 0) {
      return res.status(409).json({ error: 'No active job segment' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to finish job segment' });
  }
});

// Offline-first sync: upserts a job segment the device recorded locally
// (with its own timestamps), keyed by a client-generated UUID. The parent
// time entry must already be synced (mobile syncs time entries before their
// segments) — 409 here just means "retry after the time entry sync lands."
router.put('/sync', requireAuth, async (req, res) => {
  const { client_id, time_entry_client_id, job_id, state, started_at, ended_at } = req.body;

  if (!client_id || !time_entry_client_id || !job_id || !state || !started_at) {
    return res.status(400).json({
      error: 'client_id, time_entry_client_id, job_id, state, and started_at are required',
    });
  }
  if (!VALID_STATES.includes(state)) {
    return res.status(400).json({ error: `state must be one of: ${VALID_STATES.join(', ')}` });
  }

  try {
    const timeEntryResult = await pool.query(
      `SELECT id FROM time_entries WHERE user_id = $1 AND client_id = $2`,
      [req.user.userId, time_entry_client_id]
    );
    if (timeEntryResult.rows.length === 0) {
      return res.status(409).json({ error: 'Parent time entry not synced yet' });
    }
    const timeEntryId = timeEntryResult.rows[0].id;

    const assignmentResult = await pool.query(
      `SELECT 1 FROM job_assignments
       WHERE job_id = $1 AND user_id = $2
       LIMIT 1`,
      [job_id, req.user.userId]
    );
    if (assignmentResult.rows.length === 0) {
      return res.status(403).json({ error: 'You are not assigned to this job' });
    }

    const result = await pool.query(
      `INSERT INTO job_segments (time_entry_id, job_id, user_id, client_id, state, started_at, ended_at, synced_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, now())
       ON CONFLICT (user_id, client_id) DO UPDATE
         SET state = EXCLUDED.state,
             started_at = EXCLUDED.started_at,
             ended_at = EXCLUDED.ended_at,
             synced_at = now()
       RETURNING id, client_id, job_id, state, started_at, ended_at, synced_at`,
      [timeEntryId, job_id, req.user.userId, client_id, state, started_at, ended_at || null]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Sync failed' });
  }
});

module.exports = router;
