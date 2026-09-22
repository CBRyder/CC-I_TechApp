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

// For the assignment picker (who a job can be assigned to) and the admin
// user/role management screen — includes every role each user holds.
router.get('/users', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT u.id, u.full_name, u.username, u.email,
              COALESCE(array_agg(ur.role) FILTER (WHERE ur.role IS NOT NULL), '{}') AS roles
       FROM users u
       LEFT JOIN user_roles ur ON ur.user_id = u.id
       WHERE u.status = 'active'
       GROUP BY u.id
       ORDER BY u.full_name`
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

const VALID_ROLES = ['tech', 'admin'];

// Replaces a user's full role set in one call (checkboxes on the admin
// screen, not incremental grant/revoke calls) — e.g. { roles: ['tech',
// 'admin'] } for someone who's both. Roles are never self-service (see
// auth.js's register comment); this is the one place they're actually
// granted, gated on the caller already holding 'admin'.
router.put('/users/:userId/roles', requireAuth, requireRole('admin'), async (req, res) => {
  const userId = Number(req.params.userId);
  const { roles } = req.body;

  if (!Array.isArray(roles) || roles.length === 0) {
    return res.status(400).json({ error: 'roles must be a non-empty array' });
  }
  const invalid = roles.filter((r) => !VALID_ROLES.includes(r));
  if (invalid.length > 0) {
    return res.status(400).json({ error: `Invalid role(s): ${invalid.join(', ')}` });
  }
  // Can't demote yourself out of admin — avoids locking everyone (including
  // yourself) out with no admin left to undo it. A different admin can still
  // remove this one's admin role.
  if (userId === req.user.userId && !roles.includes('admin')) {
    return res.status(400).json({ error: 'You cannot remove your own admin role' });
  }

  try {
    const userResult = await pool.query('SELECT id FROM users WHERE id = $1', [userId]);
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    await pool.query('DELETE FROM user_roles WHERE user_id = $1', [userId]);
    for (const role of new Set(roles)) {
      await pool.query(
        'INSERT INTO user_roles (user_id, role) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [userId, role]
      );
    }

    const rolesResult = await pool.query('SELECT role FROM user_roles WHERE user_id = $1', [
      userId,
    ]);
    res.json({ userId, roles: rolesResult.rows.map((r) => r.role) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update roles' });
  }
});

module.exports = router;
