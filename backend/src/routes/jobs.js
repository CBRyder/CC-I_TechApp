const express = require('express');
const pool = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');
const { audit } = require('../audit');

const router = express.Router();

router.get('/', requireAuth, async (req, res) => {
  try {
    const roleResult = await pool.query(
      `SELECT COALESCE(array_agg(role ORDER BY role), '{}') AS roles
       FROM user_roles WHERE user_id = $1`,
      [req.user.userId]
    );
    const admin = roleResult.rows[0].roles.includes('admin');
    const result = await pool.query(
      admin
        ? `SELECT id, job_number, name, address, customer_name, status FROM jobs WHERE status = 'open' ORDER BY job_number`
        : `SELECT DISTINCT j.id, j.job_number, j.name, j.address, j.customer_name, j.status
           FROM jobs j JOIN job_assignments ja ON ja.job_id = j.id
           WHERE j.status = 'open' AND ja.user_id = $1 ORDER BY j.job_number`,
      admin ? [] : [req.user.userId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch jobs' });
  }
});

router.get('/:jobId/history', requireAuth, async (req, res) => {
  const jobId = Number(req.params.jobId);
  if (!Number.isInteger(jobId) || jobId <= 0) return res.status(400).json({ error: 'Invalid jobId' });
  try {
    if (!req.user.roles.includes('admin')) {
      const access = await pool.query(
        'SELECT 1 FROM job_assignments WHERE job_id = $1 AND user_id = $2 LIMIT 1',
        [jobId, req.user.userId]
      );
      if (!access.rows.length) return res.status(403).json({ error: 'You are not authorized for this job' });
    }
    const result = await pool.query(
      `SELECT jc.id, jc.visit_summary, jc.submitted_at,
              COALESCE(jc.employee_display_name, u.full_name) AS tech_name
       FROM job_completions jc
       JOIN job_segments js ON js.id = jc.job_segment_id
       LEFT JOIN users u ON u.id = jc.user_id
       WHERE js.job_id = $1 AND jc.submitted_at IS NOT NULL
         AND jc.visit_summary IS NOT NULL AND jc.visit_summary != ''
       ORDER BY jc.submitted_at DESC`,
      [jobId]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch job history' });
  }
});

router.post('/', requireAuth, requireRole('admin'), async (req, res) => {
  const { job_number, name, address, customer_name, location_name, total_visits } = req.body;
  if (!job_number || !name) return res.status(400).json({ error: 'job_number and name are required' });
  if (total_visits != null && !Number.isInteger(total_visits)) return res.status(400).json({ error: 'total_visits must be an integer' });
  try {
    const result = await pool.query(
      `INSERT INTO jobs (job_number, name, address, customer_name, location_name, total_visits)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, job_number, name, address, customer_name, location_name, status, total_visits`,
      [job_number, name, address || null, customer_name || null, location_name || null, total_visits ?? null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'A job with that job number already exists' });
    console.error(err);
    res.status(500).json({ error: 'Failed to create job' });
  }
});

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

router.get('/assigned', requireAuth, async (req, res) => {
  const { date } = req.query;
  if (!date || !DATE_RE.test(date)) return res.status(400).json({ error: 'date is required, as YYYY-MM-DD' });
  try {
    const result = await pool.query(
      `SELECT j.id, j.job_number, j.name, j.address, j.customer_name, j.status
       FROM job_assignments ja JOIN jobs j ON j.id = ja.job_id
       WHERE ja.user_id = $1 AND ja.assigned_date = $2 ORDER BY j.job_number`,
      [req.user.userId, date]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch assigned jobs' });
  }
});

router.post('/:jobId/assign', requireAuth, requireRole('admin'), async (req, res) => {
  const { jobId } = req.params;
  const { user_id, date } = req.body;
  if (!user_id || !date || !DATE_RE.test(date)) return res.status(400).json({ error: 'user_id and date are required' });
  try {
    const jobResult = await pool.query('SELECT id, job_number, total_visits FROM jobs WHERE id = $1', [jobId]);
    if (!jobResult.rows.length) return res.status(404).json({ error: 'Job not found' });
    const userResult = await pool.query(`SELECT id FROM users WHERE id = $1 AND status = 'active'`, [user_id]);
    if (!userResult.rows.length) return res.status(404).json({ error: 'Active user not found' });
    const next = await pool.query('SELECT COALESCE(MAX(visit_number), 0) + 1 AS next FROM job_assignments WHERE job_id = $1', [jobId]);
    const inserted = await pool.query(
      `INSERT INTO job_assignments (job_id, user_id, assigned_date, visit_number)
       VALUES ($1, $2, $3, $4) ON CONFLICT (job_id, user_id, assigned_date) DO NOTHING RETURNING visit_number`,
      [jobId, user_id, date, next.rows[0].next]
    );
    const visitNumber = inserted.rows[0]?.visit_number ?? (
      await pool.query('SELECT visit_number FROM job_assignments WHERE job_id = $1 AND user_id = $2 AND assigned_date = $3', [jobId, user_id, date])
    ).rows[0].visit_number;
    const job = jobResult.rows[0];
    await audit({ actorUserId: req.user.userId, targetUserId: Number(user_id), action: 'job_visit_assigned', resourceType: 'job_assignment', resourceId: inserted.rows[0]?.visit_number ?? visitNumber, ipAddress: req.ip, metadata: { job_id: Number(jobId), assigned_date: date } });
    res.status(201).json({
      jobId: Number(jobId), userId: Number(user_id), date, visitNumber,
      visitCode: `${job.job_number}-V${visitNumber}${job.total_visits != null ? `-${job.total_visits}` : ''}`,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to assign job' });
  }
});

router.delete('/:jobId/assign', requireAuth, requireRole('admin'), async (req, res) => {
  const { jobId } = req.params;
  const { user_id, date } = req.query;
  if (!user_id || !date || !DATE_RE.test(date)) return res.status(400).json({ error: 'user_id and date are required' });
  try {
    const result = await pool.query('DELETE FROM job_assignments WHERE job_id = $1 AND user_id = $2 AND assigned_date = $3 RETURNING id', [jobId, user_id, date]);
    if (result.rows.length) await audit({ actorUserId: req.user.userId, targetUserId: Number(user_id), action: 'job_visit_unassigned', resourceType: 'job_assignment', resourceId: result.rows[0].id, ipAddress: req.ip, metadata: { job_id: Number(jobId), assigned_date: date } });
    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to unassign job' });
  }
});

module.exports = router;