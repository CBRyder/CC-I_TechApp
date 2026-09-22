const express = require('express');
const pool = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

const VALID_STATUSES = ['incoming', 'in_progress', 'completed'];

// Every visit (= a job_assignments row) with a computed status and its
// searchable code ("4298-V1-30" — job code, visit number, total visits).
// Status is derived, not stored, so it can never drift from what actually
// happened: incoming (no work logged yet), in_progress (work logged, not
// submitted), completed (a submitted completion exists for it).
router.get('/visits', requireAuth, requireRole('admin'), async (req, res) => {
  const { status, q } = req.query;
  if (status && !VALID_STATUSES.includes(status)) {
    return res.status(400).json({ error: `status must be one of: ${VALID_STATUSES.join(', ')}` });
  }

  try {
    const result = await pool.query(
      `WITH visits AS (
         SELECT
           ja.id AS assignment_id,
           ja.job_id,
           ja.user_id,
           ja.assigned_date,
           ja.visit_number,
           j.job_number,
           j.name AS job_name,
           j.address,
           j.customer_name,
           j.total_visits,
           u.full_name AS assigned_to,
           (j.job_number || '-V' || ja.visit_number::text ||
             CASE WHEN j.total_visits IS NOT NULL THEN '-' || j.total_visits::text ELSE '' END
           ) AS visit_code,
           CASE
             WHEN EXISTS (
               SELECT 1 FROM job_completions jc
               JOIN job_segments js ON js.id = jc.job_segment_id
               WHERE js.job_id = ja.job_id AND js.user_id = ja.user_id
                 AND js.started_at::date = ja.assigned_date
                 AND jc.submitted_at IS NOT NULL
             ) THEN 'completed'
             WHEN EXISTS (
               SELECT 1 FROM job_segments js
               WHERE js.job_id = ja.job_id AND js.user_id = ja.user_id
                 AND js.started_at::date = ja.assigned_date
             ) THEN 'in_progress'
             ELSE 'incoming'
           END AS status
         FROM job_assignments ja
         JOIN jobs j ON j.id = ja.job_id
         JOIN users u ON u.id = ja.user_id
       )
       SELECT * FROM visits
       WHERE ($1::text IS NULL OR status = $1)
         AND ($2::text IS NULL OR job_number ILIKE '%' || $2 || '%' OR visit_code ILIKE '%' || $2 || '%')
       ORDER BY assigned_date DESC, job_number, visit_number`,
      [status || null, q || null]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch visits' });
  }
});

// For the assignment picker — who a job can be assigned to.
router.get('/users', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, full_name, username, email, role FROM users WHERE status = 'active' ORDER BY full_name`
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

module.exports = router;
