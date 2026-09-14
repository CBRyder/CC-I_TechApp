const express = require('express');
const pool = require('../db');
const requireAuth = require('../middleware/auth');

const router = express.Router();

// Returns the caller's currently open time entry (if any) plus its active
// job segment (if any, with job details) — lets the mobile app restore UI
// state on launch/resume instead of assuming the user is clocked out.
router.get('/current', requireAuth, async (req, res) => {
  try {
    const timeEntryResult = await pool.query(
      `SELECT id, clock_in_at
       FROM time_entries
       WHERE user_id = $1 AND clock_out_at IS NULL
       ORDER BY clock_in_at DESC
       LIMIT 1`,
      [req.user.userId]
    );
    const timeEntry = timeEntryResult.rows[0] || null;

    let activeSegment = null;
    if (timeEntry) {
      const segmentResult = await pool.query(
        `SELECT js.id, js.state, js.started_at, js.job_id,
                j.job_number, j.name, j.address, j.customer_name
         FROM job_segments js
         JOIN jobs j ON j.id = js.job_id
         WHERE js.time_entry_id = $1 AND js.ended_at IS NULL
         ORDER BY js.started_at DESC
         LIMIT 1`,
        [timeEntry.id]
      );
      activeSegment = segmentResult.rows[0] || null;
    }

    res.json({ timeEntry, activeSegment });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch current status' });
  }
});

router.post('/clock-in', requireAuth, async (req, res) => {
  try {
    const existing = await pool.query(
      `SELECT id FROM time_entries WHERE user_id = $1 AND clock_out_at IS NULL`,
      [req.user.userId]
    );
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'Already clocked in' });
    }

    const result = await pool.query(
      `INSERT INTO time_entries (user_id, clock_in_at)
       VALUES ($1, now())
       RETURNING id, clock_in_at`,
      [req.user.userId]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Clock in failed' });
  }
});

router.post('/clock-out', requireAuth, async (req, res) => {
  try {
    const openEntry = await pool.query(
      `SELECT id FROM time_entries WHERE user_id = $1 AND clock_out_at IS NULL`,
      [req.user.userId]
    );
    if (openEntry.rows.length === 0) {
      return res.status(409).json({ error: 'Not currently clocked in' });
    }
    const timeEntryId = openEntry.rows[0].id;

    // Auto-finish any still-active job segment so a tech who forgets to
    // explicitly finish their last job isn't blocked from clocking out.
    await pool.query(
      `UPDATE job_segments SET ended_at = now()
       WHERE time_entry_id = $1 AND ended_at IS NULL`,
      [timeEntryId]
    );

    const result = await pool.query(
      `UPDATE time_entries SET clock_out_at = now()
       WHERE id = $1
       RETURNING id, clock_in_at, clock_out_at`,
      [timeEntryId]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Clock out failed' });
  }
});

module.exports = router;
