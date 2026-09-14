const express = require('express');
const pool = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

router.get('/', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, job_number, name, address, customer_name, status
       FROM jobs
       WHERE status = 'open'
       ORDER BY job_number`
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch jobs' });
  }
});

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// The device's local date, not the server's — a tech in a different
// timezone than the server should see "today" as their own today. Callers
// always pass it explicitly rather than relying on the server to guess.
router.get('/assigned', requireAuth, async (req, res) => {
  const { date } = req.query;
  if (!date || !DATE_RE.test(date)) {
    return res.status(400).json({ error: 'date is required, as YYYY-MM-DD' });
  }

  try {
    const result = await pool.query(
      `SELECT j.id, j.job_number, j.name, j.address, j.customer_name, j.status
       FROM job_assignments ja
       JOIN jobs j ON j.id = ja.job_id
       WHERE ja.user_id = $1 AND ja.assigned_date = $2
       ORDER BY j.job_number`,
      [req.user.userId, date]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch assigned jobs' });
  }
});

// Dispatch — admin-only. A user can hold both the tech and admin roles at
// once (see migration 008 / requireRole), so "admin assigns a job" and
// "admin is also the tech working it" are both normal, not a contradiction.
router.post('/:jobId/assign', requireAuth, requireRole('admin'), async (req, res) => {
  const { jobId } = req.params;
  const { user_id, date } = req.body;
  if (!user_id) {
    return res.status(400).json({ error: 'user_id is required' });
  }
  if (!date || !DATE_RE.test(date)) {
    return res.status(400).json({ error: 'date is required, as YYYY-MM-DD' });
  }

  try {
    const jobResult = await pool.query(`SELECT id FROM jobs WHERE id = $1`, [jobId]);
    if (jobResult.rows.length === 0) {
      return res.status(404).json({ error: 'Job not found' });
    }
    const userResult = await pool.query(`SELECT id FROM users WHERE id = $1`, [user_id]);
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Idempotent — assigning the same job/user/date twice is a no-op.
    await pool.query(
      `INSERT INTO job_assignments (job_id, user_id, assigned_date)
       VALUES ($1, $2, $3)
       ON CONFLICT (job_id, user_id, assigned_date) DO NOTHING`,
      [jobId, user_id, date]
    );
    res.status(201).json({ jobId: Number(jobId), userId: Number(user_id), date });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to assign job' });
  }
});

router.delete('/:jobId/assign', requireAuth, requireRole('admin'), async (req, res) => {
  const { jobId } = req.params;
  const { user_id, date } = req.query;
  if (!user_id) {
    return res.status(400).json({ error: 'user_id is required' });
  }
  if (!date || !DATE_RE.test(date)) {
    return res.status(400).json({ error: 'date is required, as YYYY-MM-DD' });
  }

  try {
    await pool.query(
      `DELETE FROM job_assignments WHERE job_id = $1 AND user_id = $2 AND assigned_date = $3`,
      [jobId, user_id, date]
    );
    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to unassign job' });
  }
});

module.exports = router;
