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

// Any authenticated tech (not admin-only) — the notes/summaries other techs
// left on past visits to this job, so someone heading out to it can see
// what happened last time. Only submitted completions with an actual
// summary show up; drafts and blank ones are skipped.
router.get('/:jobId/history', requireAuth, async (req, res) => {
  const { jobId } = req.params;

  try {
    const result = await pool.query(
      `SELECT jc.id, jc.visit_summary, jc.submitted_at, u.full_name AS tech_name
       FROM job_completions jc
       JOIN job_segments js ON js.id = jc.job_segment_id
       JOIN users u ON u.id = jc.user_id
       WHERE js.job_id = $1
         AND jc.submitted_at IS NOT NULL
         AND jc.visit_summary IS NOT NULL
         AND jc.visit_summary != ''
       ORDER BY jc.submitted_at DESC`,
      [jobId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch job history' });
  }
});

// Admin-only: create a job. Previously jobs could only be seeded via
// migration — this is what the admin "add a job" screen calls.
router.post('/', requireAuth, requireRole('admin'), async (req, res) => {
  const { job_number, name, address, customer_name, total_visits } = req.body;

  if (!job_number || !name) {
    return res.status(400).json({ error: 'job_number and name are required' });
  }
  if (total_visits !== undefined && total_visits !== null && !Number.isInteger(total_visits)) {
    return res.status(400).json({ error: 'total_visits must be an integer' });
  }

  try {
    const result = await pool.query(
      `INSERT INTO jobs (job_number, name, address, customer_name, total_visits)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, job_number, name, address, customer_name, status, total_visits`,
      [job_number, name, address || null, customer_name || null, total_visits ?? null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create job' });
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
    const jobResult = await pool.query(`SELECT id, job_number, total_visits FROM jobs WHERE id = $1`, [
      jobId,
    ]);
    if (jobResult.rows.length === 0) {
      return res.status(404).json({ error: 'Job not found' });
    }
    const job = jobResult.rows[0];

    const userResult = await pool.query(`SELECT id FROM users WHERE id = $1`, [user_id]);
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Ascending per job — visit 1, 2, 3... for this specific job. Computed
    // here rather than a DB sequence since it needs to reset per job_id;
    // fine for expected admin-only, low-concurrency usage.
    const nextVisitResult = await pool.query(
      `SELECT COALESCE(MAX(visit_number), 0) + 1 AS next FROM job_assignments WHERE job_id = $1`,
      [jobId]
    );
    const visitNumber = nextVisitResult.rows[0].next;

    // Idempotent — assigning the same job/user/date twice is a no-op (and
    // doesn't burn a visit number on the second call).
    const insertResult = await pool.query(
      `INSERT INTO job_assignments (job_id, user_id, assigned_date, visit_number)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (job_id, user_id, assigned_date) DO NOTHING
       RETURNING visit_number`,
      [jobId, user_id, date, visitNumber]
    );
    const finalVisitNumber =
      insertResult.rows[0]?.visit_number ??
      (
        await pool.query(
          `SELECT visit_number FROM job_assignments WHERE job_id = $1 AND user_id = $2 AND assigned_date = $3`,
          [jobId, user_id, date]
        )
      ).rows[0].visit_number;

    const visitCode = `${job.job_number}-V${finalVisitNumber}${
      job.total_visits != null ? `-${job.total_visits}` : ''
    }`;

    res.status(201).json({
      jobId: Number(jobId),
      userId: Number(user_id),
      date,
      visitNumber: finalVisitNumber,
      visitCode,
    });
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
