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

// Soft-delete — sets status='inactive' rather than a real DELETE, since
// users are referenced all over (time_entries, job_segments, job_assignments,
// etc.) and a hard delete would either fail on the FK or silently orphan
// history. Also revokes every refresh token so it can't keep using any
// already-remembered session, and drops it from user_roles (status='active'
// is what everything already gates on, but this keeps roles from lingering
// on a deactivated account).
router.delete('/users/:userId', requireAuth, requireRole('admin'), async (req, res) => {
  const userId = Number(req.params.userId);

  if (userId === req.user.userId) {
    return res.status(400).json({ error: 'You cannot delete your own account' });
  }

  try {
    const userResult = await pool.query(
      `UPDATE users SET status = 'inactive' WHERE id = $1 AND status = 'active' RETURNING id`,
      [userId]
    );
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    await pool.query('DELETE FROM refresh_tokens WHERE user_id = $1', [userId]);
    await pool.query('DELETE FROM user_roles WHERE user_id = $1', [userId]);

    res.json({ userId, status: 'inactive' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

// Full detail for one visit (a job_assignments row) — the job/tech info
// already in the /visits list, plus its completion (summary, PO number)
// and the parts logged against it. completion is null if nothing's been
// submitted for it yet (shouldn't normally happen from the "completed"
// filter, but the admin visit list doesn't strictly stop someone opening
// an in-progress one).
router.get('/visits/:assignmentId', requireAuth, requireRole('admin'), async (req, res) => {
  const assignmentId = Number(req.params.assignmentId);

  try {
    const assignmentResult = await pool.query(
      `SELECT
         ja.id AS assignment_id, ja.job_id, ja.user_id, ja.assigned_date, ja.visit_number,
         j.job_number, j.name AS job_name, j.address, j.customer_name, j.total_visits,
         u.full_name AS assigned_to,
         (j.job_number || '-V' || ja.visit_number::text ||
           CASE WHEN j.total_visits IS NOT NULL THEN '-' || j.total_visits::text ELSE '' END
         ) AS visit_code
       FROM job_assignments ja
       JOIN jobs j ON j.id = ja.job_id
       JOIN users u ON u.id = ja.user_id
       WHERE ja.id = $1`,
      [assignmentId]
    );
    const assignment = assignmentResult.rows[0];
    if (!assignment) {
      return res.status(404).json({ error: 'Visit not found' });
    }

    const completionResult = await pool.query(
      `SELECT jc.id, jc.visit_summary, jc.submitted_at, jc.po_number
       FROM job_completions jc
       JOIN job_segments js ON js.id = jc.job_segment_id
       WHERE js.job_id = $1 AND js.user_id = $2 AND js.started_at::date = $3
         AND jc.submitted_at IS NOT NULL
       ORDER BY jc.submitted_at DESC LIMIT 1`,
      [assignment.job_id, assignment.user_id, assignment.assigned_date]
    );
    const completion = completionResult.rows[0] || null;

    let parts = [];
    if (completion) {
      const partsResult = await pool.query(
        `SELECT jcp.id, jcp.quantity, pc.name, pc.category, pc.unit
         FROM job_completion_parts jcp
         JOIN parts_catalog pc ON pc.id = jcp.part_id
         WHERE jcp.job_completion_id = $1
         ORDER BY pc.category, pc.name`,
        [completion.id]
      );
      parts = partsResult.rows;
    }

    res.json({ ...assignment, completion, parts });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch visit' });
  }
});

// Admin-only — the PO number is billing metadata set after the fact, never
// something the tech who did the work enters.
router.put('/job-completions/:completionId/po', requireAuth, requireRole('admin'), async (req, res) => {
  const completionId = Number(req.params.completionId);
  const { po_number } = req.body;

  try {
    const result = await pool.query(
      `UPDATE job_completions SET po_number = $1 WHERE id = $2 RETURNING id, po_number`,
      [po_number || null, completionId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Completion not found' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to set PO number' });
  }
});

module.exports = router;
