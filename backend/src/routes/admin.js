const express = require('express');
const pool = require('../db');
const { requireAuth, requireRole } = require('../middleware/auth');
const { audit } = require('../audit');

const router = express.Router();

// Status is derived, not stored, so it can never drift from what actually
// happened — and it's labeled off the ASSIGNED TECH'S tech_types (sticky,
// admin-set array — see migration 013; a tech can be both), not anything
// stored on the job itself:
//   - no segment logged yet:                    at_shop / ready
//   - a segment exists, no submitted completion:  in_progress (either)
//   - a submitted completion exists:             shop_return / completed
// ("Incoming" is reserved for a future status — something physically
// inbound to the shop, not yet arrived — distinct from "ready," which is
// a road job that just hasn't been headed out to yet.)
// A shop tech's "Shop Return" and a road tech's "Completed" are the exact
// same underlying event (the tech tapped Finish) — only the admin-facing
// label differs. For a tech who's exclusively one type, that's a fixed
// answer. For a tech who's both, a dispatcher can set job_assignments
// .visit_type explicitly when assigning (see migration 023) — if set,
// that wins outright; if left unset, it falls back to inferring from
// this visit's own data: shop-style unless it actually has a travel
// segment (the concrete signal they went "on the road" for it).
const VALID_STATUSES = ['at_shop', 'ready', 'in_progress', 'shop_return', 'completed'];

function actsAsShopSql(techTypesCol, hasTravelCol, visitTypeCol) {
  return `(CASE
    WHEN ${visitTypeCol} = 'shop' THEN true
    WHEN ${visitTypeCol} = 'road' THEN false
    WHEN ${techTypesCol} = ARRAY['shop']::text[] THEN true
    WHEN ${techTypesCol} = ARRAY['road']::text[] THEN false
    ELSE NOT ${hasTravelCol}
  END)`;
}

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
           ja.visit_type,
           j.job_number,
           j.name AS job_name,
           j.address,
           j.customer_name,
           j.location_name,
           j.total_visits,
           COALESCE(u.full_name, ja.employee_display_name) AS assigned_to,
           COALESCE(u.tech_types, ja.employee_tech_types) AS tech_types,
           (j.job_number || '-V' || ja.visit_number::text ||
             CASE WHEN j.total_visits IS NOT NULL THEN '-' || j.total_visits::text ELSE '' END
           ) AS visit_code,
           EXISTS (
             SELECT 1 FROM job_completions jc
             JOIN job_segments js ON js.id = jc.job_segment_id
             WHERE js.job_id = ja.job_id
               AND (js.user_id = ja.user_id OR (ja.user_id IS NULL AND js.employee_display_name = ja.employee_display_name))
               AND js.started_at::date = ja.assigned_date
               AND jc.submitted_at IS NOT NULL
           ) AS is_completed,
           EXISTS (
             SELECT 1 FROM job_segments js
             WHERE js.job_id = ja.job_id
               AND (js.user_id = ja.user_id OR (ja.user_id IS NULL AND js.employee_display_name = ja.employee_display_name))
               AND js.started_at::date = ja.assigned_date
           ) AS has_segment,
           EXISTS (
             SELECT 1 FROM job_segments js
             WHERE js.job_id = ja.job_id
               AND (js.user_id = ja.user_id OR (ja.user_id IS NULL AND js.employee_display_name = ja.employee_display_name))
               AND js.started_at::date = ja.assigned_date AND js.state = 'travel'
           ) AS has_travel_segment
         FROM job_assignments ja
         JOIN jobs j ON j.id = ja.job_id
         LEFT JOIN users u ON u.id = ja.user_id
       )
       SELECT assignment_id, job_id, user_id, assigned_date, visit_number, visit_type, job_number, job_name,
              address, customer_name, location_name, total_visits, assigned_to, tech_types, visit_code,
              CASE
                WHEN is_completed THEN CASE WHEN ${actsAsShopSql('tech_types', 'has_travel_segment', 'visit_type')} THEN 'shop_return' ELSE 'completed' END
                WHEN has_segment THEN 'in_progress'
                ELSE CASE WHEN ${actsAsShopSql('tech_types', 'has_travel_segment', 'visit_type')} THEN 'at_shop' ELSE 'ready' END
              END AS status
       FROM visits
       WHERE ($1::text IS NULL
         OR job_number ILIKE '%' || $1 || '%'
         OR visit_code ILIKE '%' || $1 || '%'
         OR job_name ILIKE '%' || $1 || '%'
         OR customer_name ILIKE '%' || $1 || '%'
         OR location_name ILIKE '%' || $1 || '%'
         OR assigned_to ILIKE '%' || $1 || '%'
       )
       ORDER BY assigned_date DESC, job_number, visit_number`,
      [q || null]
    );
    const rows = status ? result.rows.filter((r) => r.status === status) : result.rows;
    res.json(rows);
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
      `SELECT u.id, u.full_name, u.username, u.email, u.tech_types,
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

// Active device/session management. Session identifiers are opaque
// server-side IDs; refresh tokens themselves are never returned.
router.get('/audit', requireAuth, requireRole('admin'), async (req, res) => {
  const limit = Math.min(Math.max(Number(req.query.limit) || 100, 1), 500);
  const action = typeof req.query.action === 'string' ? req.query.action.trim() : null;
  try {
    const result = await pool.query(
      `SELECT id, actor_user_id, actor_display_name, action, target_user_id,
              resource_type, resource_id, ip_address, metadata, created_at
       FROM audit_events
       WHERE ($1::text IS NULL OR action = $1)
       ORDER BY created_at DESC
       LIMIT $2`,
      [action || null, limit]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch audit events' });
  }
});

router.get('/sessions', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT
         rt.id AS session_id,
         rt.user_id,
         u.full_name,
         u.username,
         rt.created_at,
         rt.last_used_at,
         rt.expires_at,
         right(rt.device_id, 6) AS device_suffix
       FROM refresh_tokens rt
       JOIN users u ON u.id = rt.user_id
       WHERE rt.revoked_at IS NULL
         AND rt.expires_at > now()
       ORDER BY rt.last_used_at DESC NULLS LAST, rt.created_at DESC`
    );

    res.json(
      result.rows.map((row) => ({
        ...row,
        device_label: `Device ••••${row.device_suffix}`,
      }))
    );
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch active sessions' });
  }
});

router.delete('/sessions/:sessionId', requireAuth, requireRole('admin'), async (req, res) => {
  const sessionId = Number(req.params.sessionId);
  if (!Number.isInteger(sessionId) || sessionId <= 0) {
    return res.status(400).json({ error: 'Invalid sessionId' });
  }

  try {
    const result = await pool.query(
      `UPDATE refresh_tokens
       SET revoked_at = COALESCE(revoked_at, now())
       WHERE id = $1 AND revoked_at IS NULL
       RETURNING id AS session_id, user_id`,
      [sessionId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Active session not found' });
    }

    await audit({ actorUserId: req.user.userId, targetUserId: result.rows[0].user_id, action: 'session_revoked_by_admin', resourceType: 'session', resourceId: sessionId, ipAddress: req.ip });
    res.json({ ...result.rows[0], revoked: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to revoke session' });
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
    await audit({ actorUserId: req.user.userId, targetUserId: userId, action: 'user_roles_changed', resourceType: 'user', resourceId: userId, ipAddress: req.ip, metadata: { roles: rolesResult.rows.map((r) => r.role) } });
    res.json({ userId, roles: rolesResult.rows.map((r) => r.role) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update roles' });
  }
});

router.post('/users/:userId/reset-password', requireAuth, requireRole('admin'), async (req, res) => {
  const userId = Number(req.params.userId);
  const { new_password } = req.body;

  if (!Number.isInteger(userId) || userId <= 0) {
    return res.status(400).json({ error: 'Invalid userId' });
  }
  if (typeof new_password !== 'string' || new_password.length < 8) {
    return res.status(400).json({ error: 'new_password must be at least 8 characters' });
  }

  try {
    const bcrypt = require('bcrypt');
    const passwordHash = await bcrypt.hash(new_password, 10);

    const result = await pool.query(
      `UPDATE users
       SET password_hash = $1
       WHERE id = $2 AND status = 'active'
       RETURNING id`,
      [passwordHash, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Per the security policy, an admin reset changes the password but does
    // not revoke the target user's existing sessions.
    await audit({
      actorUserId: req.user.userId,
      targetUserId: userId,
      action: 'admin_password_reset',
      resourceType: 'user',
      resourceId: userId,
      ipAddress: req.ip,
    });

    res.json({ success: true, userId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to reset password' });
  }
});

const VALID_TECH_TYPES = ['shop', 'road'];

// Sticky classification (see migration 013) that decides which visit
// status labels a tech's work shows up under for the admin — see the
// comment on actsAsShopSql above for how a tech who's both gets resolved
// per-visit. Full replacement (3-way toggle on the admin screen: Shop /
// Both / Road), same pattern as roles — admin-set, not self-service.
router.put('/users/:userId/tech-types', requireAuth, requireRole('admin'), async (req, res) => {
  const userId = Number(req.params.userId);
  const { tech_types } = req.body;

  if (!Array.isArray(tech_types) || tech_types.length === 0) {
    return res.status(400).json({ error: 'tech_types must be a non-empty array' });
  }
  const invalid = tech_types.filter((t) => !VALID_TECH_TYPES.includes(t));
  if (invalid.length > 0) {
    return res.status(400).json({ error: `Invalid tech_type(s): ${invalid.join(', ')}` });
  }

  try {
    const result = await pool.query(
      `UPDATE users SET tech_types = $1 WHERE id = $2 RETURNING id, tech_types`,
      [Array.from(new Set(tech_types)), userId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update tech types' });
  }
});

// Hard-delete the account while preserving historical business records.
// Historical rows retain only First Name + Last Initial; personal account data,
// roles, preferences, and refresh-token sessions are deleted with the user.
router.delete('/users/:userId', requireAuth, requireRole('admin'), async (req, res) => {
  const userId = Number(req.params.userId);

  if (!Number.isInteger(userId) || userId <= 0) {
    return res.status(400).json({ error: 'Invalid userId' });
  }
  if (userId === req.user.userId) {
    return res.status(400).json({ error: 'You cannot delete your own account' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const userResult = await client.query(
      'SELECT id, full_name, tech_types FROM users WHERE id = $1 FOR UPDATE',
      [userId]
    );
    const user = userResult.rows[0];
    if (!user) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'User not found' });
    }

    const parts = user.full_name.trim().split(/\\s+/);
    const displayName =
      parts.length > 1
        ? `${parts[0]} ${parts[parts.length - 1].slice(-1).toUpperCase()}.`
        : parts[0];

    // Capture the minimum identity needed for business history before the
    // users row is removed. No email, username, phone, or password survives.
    const historyTables = [
      'time_entries',
      'job_segments',
      'timesheets',
      'job_completions',
      'job_completion_parts',
      'job_completion_photos',
    ];

    for (const table of historyTables) {
      await client.query(
        `UPDATE ${table}
         SET employee_display_name = $1
         WHERE user_id = $2`,
        [displayName, userId]
      );
    }

    await client.query(
      `UPDATE job_assignments
       SET employee_display_name = $1,
           employee_tech_types = $2
       WHERE user_id = $3`,
      [displayName, user.tech_types || null, userId]
    );

    await client.query('DELETE FROM users WHERE id = $1', [userId]);
    await client.query('COMMIT');

    await audit({ actorUserId: req.user.userId, targetUserId: userId, action: 'user_deleted', resourceType: 'user', resourceId: userId, ipAddress: req.ip, metadata: { historical_name: displayName } });
    res.json({ userId, status: 'deleted', historical_name: displayName });
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch {}
    console.error(err);
    res.status(500).json({ error: 'Failed to delete user' });
  } finally {
    client.release();
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
         ja.id AS assignment_id, ja.job_id, ja.user_id, ja.assigned_date, ja.visit_number, ja.visit_type,
         j.job_number, j.name AS job_name, j.address, j.customer_name, j.location_name, j.total_visits,
         COALESCE(u.full_name, ja.employee_display_name) AS assigned_to,
         COALESCE(u.tech_types, ja.employee_tech_types) AS tech_types,
         (j.job_number || '-V' || ja.visit_number::text ||
           CASE WHEN j.total_visits IS NOT NULL THEN '-' || j.total_visits::text ELSE '' END
         ) AS visit_code
       FROM job_assignments ja
       JOIN jobs j ON j.id = ja.job_id
       LEFT JOIN users u ON u.id = ja.user_id
       WHERE ja.id = $1`,
      [assignmentId]
    );
    const assignment = assignmentResult.rows[0];
    if (!assignment) {
      return res.status(404).json({ error: 'Visit not found' });
    }

    // "Arrived at" isn't its own recorded event — it's just the moment the
    // first travel segment ended and work began, which is already the work
    // segment's started_at. Only meaningful for a road tech (a shop tech
    // has no travel segment), but harmless either way.
    const arrivedResult = await pool.query(
      `SELECT started_at FROM job_segments
       WHERE job_id = $1
         AND (user_id = $2 OR ($2::integer IS NULL AND employee_display_name = $4))
         AND started_at::date = $3 AND state = 'work'
       ORDER BY started_at ASC LIMIT 1`,
      [assignment.job_id, assignment.user_id, assignment.assigned_date, assignment.assigned_to]
    );
    const arrivedAt = arrivedResult.rows[0]?.started_at || null;

    const hasSegmentResult = await pool.query(
      `SELECT 1 FROM job_segments
       WHERE job_id = $1
         AND (user_id = $2 OR ($2::integer IS NULL AND employee_display_name = $4))
         AND started_at::date = $3 LIMIT 1`,
      [assignment.job_id, assignment.user_id, assignment.assigned_date, assignment.assigned_to]
    );
    const hasSegment = hasSegmentResult.rows.length > 0;

    const hasTravelResult = await pool.query(
      `SELECT 1 FROM job_segments
       WHERE job_id = $1
         AND (user_id = $2 OR ($2::integer IS NULL AND employee_display_name = $4))
         AND started_at::date = $3 AND state = 'travel' LIMIT 1`,
      [assignment.job_id, assignment.user_id, assignment.assigned_date, assignment.assigned_to]
    );
    const hasTravelSegment = hasTravelResult.rows.length > 0;

    const completionResult = await pool.query(
      `SELECT jc.id, jc.visit_summary, jc.submitted_at, jc.po_number
       FROM job_completions jc
       JOIN job_segments js ON js.id = jc.job_segment_id
       WHERE js.job_id = $1
         AND (js.user_id = $2 OR ($2::integer IS NULL AND js.employee_display_name = $4))
         AND js.started_at::date = $3
         AND jc.submitted_at IS NOT NULL
       ORDER BY jc.submitted_at DESC LIMIT 1`,
      [assignment.job_id, assignment.user_id, assignment.assigned_date, assignment.assigned_to]
    );
    const completion = completionResult.rows[0] || null;
    // Mirrors actsAsShopSql above (JS instead of SQL — no need for a whole
    // extra query round-trip just to reuse that logic here).
    const techTypes = assignment.tech_types;
    const actsAsShop =
      assignment.visit_type === 'shop'
        ? true
        : assignment.visit_type === 'road'
        ? false
        : techTypes.length === 1 && techTypes[0] === 'shop'
        ? true
        : techTypes.length === 1 && techTypes[0] === 'road'
        ? false
        : !hasTravelSegment;
    const status = completion
      ? actsAsShop ? 'shop_return' : 'completed'
      : hasSegment
      ? 'in_progress'
      : actsAsShop ? 'at_shop' : 'ready';

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

    res.json({ ...assignment, status, arrived_at: arrivedAt, completion, parts });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch visit' });
  }
});

// Admin-editable job metadata — the "umbrella" (customer_name, e.g. "Waste
// Management") and the specific site name under it (location_name, e.g.
// "Walmart"), distinct from the raw street address. There's no job-creation
// UI yet, so this is how these get filled in on existing jobs.
router.put('/jobs/:jobId', requireAuth, requireRole('admin'), async (req, res) => {
  const jobId = Number(req.params.jobId);
  const { customer_name, location_name } = req.body;

  try {
    const result = await pool.query(
      `UPDATE jobs SET
         customer_name = COALESCE($1, customer_name),
         location_name = COALESCE($2, location_name)
       WHERE id = $3
       RETURNING id, customer_name, location_name`,
      [customer_name ?? null, location_name ?? null, jobId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Job not found' });
    }
    await audit({ actorUserId: req.user.userId, action: 'job_metadata_updated', resourceType: 'job', resourceId: jobId, ipAddress: req.ip });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update job' });
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
    await audit({ actorUserId: req.user.userId, action: 'completion_po_updated', resourceType: 'job_completion', resourceId: completionId, ipAddress: req.ip });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to set PO number' });
  }
});

// Un-marks a completed visit as completed (clears submitted_at, keeps the
// notes/parts/PO already recorded) — for an admin correcting a mistake
// (marked done too early, needs more work, etc.). It'll show as
// "in_progress" again on the admin dashboard. Note this doesn't reopen
// the underlying job_segment (ended_at stays set) — it's an admin-side
// correction to the record, not a way for the tech to resume clocking on
// it from their own app.
router.post('/job-completions/:completionId/reopen', requireAuth, requireRole('admin'), async (req, res) => {
  const completionId = Number(req.params.completionId);

  try {
    const result = await pool.query(
      `UPDATE job_completions SET submitted_at = NULL WHERE id = $1 RETURNING id, submitted_at`,
      [completionId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Completion not found' });
    }
    await audit({ actorUserId: req.user.userId, action: 'completion_reopened', resourceType: 'job_completion', resourceId: completionId, ipAddress: req.ip });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to reopen visit' });
  }
});

// A reusable directory of customers ("umbrellas") for the job-creation
// picker — see migration 014. Decoupled from jobs (no FK); creating a job
// still just takes customer_name as free text, this is only where that
// name comes from when creating one through the app instead of retyping.
router.get('/customers', requireAuth, requireRole('admin'), async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM customers ORDER BY name');
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch customers' });
  }
});

router.post('/customers', requireAuth, requireRole('admin'), async (req, res) => {
  const { name, contact_name, contact_phone, contact_email, notes } = req.body;

  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'name is required' });
  }

  try {
    const result = await pool.query(
      `INSERT INTO customers (name, contact_name, contact_phone, contact_email, notes)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [name.trim(), contact_name || null, contact_phone || null, contact_email || null, notes || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'A customer with that name already exists' });
    }
    console.error(err);
    res.status(500).json({ error: 'Failed to create customer' });
  }
});

// Reassigns an EXISTING visit to a different tech and/or date, in place —
// unlike POST /jobs/:jobId/assign (which always creates a new visit with
// the next visit_number), this keeps the same visit_number/identity. For
// a dispatcher correcting a mistake, not for logging a new day of work.
router.patch('/visits/:assignmentId/reassign', requireAuth, requireRole('admin'), async (req, res) => {
  const assignmentId = Number(req.params.assignmentId);
  const { user_id, assigned_date, visit_type } = req.body;

  if (!user_id) {
    return res.status(400).json({ error: 'user_id is required' });
  }
  if (!assigned_date || !/^\d{4}-\d{2}-\d{2}$/.test(assigned_date)) {
    return res.status(400).json({ error: 'assigned_date is required, as YYYY-MM-DD' });
  }
  if (visit_type !== undefined && visit_type !== null && !['shop', 'road'].includes(visit_type)) {
    return res.status(400).json({ error: "visit_type must be 'shop' or 'road'" });
  }

  try {
    const userResult = await pool.query('SELECT id FROM users WHERE id = $1', [user_id]);
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const result = await pool.query(
      `UPDATE job_assignments SET user_id = $1, assigned_date = $2, visit_type = COALESCE($4, visit_type)
       WHERE id = $3
       RETURNING id AS assignment_id, job_id, user_id, assigned_date, visit_number, visit_type`,
      [user_id, assigned_date, assignmentId, visit_type ?? null]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Visit not found' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({
        error: 'That tech already has a visit for this job on this date',
      });
    }
    console.error(err);
    res.status(500).json({ error: 'Failed to reassign visit' });
  }
});

// Deletes the dispatch record itself (job_assignments row) — for a
// mismatched/typo'd assignment (wrong job, wrong tech, wrong date). This
// doesn't touch any hours/segments/completion the tech may have already
// logged against that job/date (there's no FK from those to
// job_assignments) — it only removes it from the admin's visit list.
router.delete('/visits/:assignmentId', requireAuth, requireRole('admin'), async (req, res) => {
  const assignmentId = Number(req.params.assignmentId);

  try {
    const result = await pool.query(
      'DELETE FROM job_assignments WHERE id = $1 RETURNING id, job_id, user_id, assigned_date',
      [assignmentId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Visit not found' });
    }
    const deleted = result.rows[0];
    await audit({
      actorUserId: req.user.userId,
      targetUserId: deleted.user_id,
      action: 'job_visit_deleted',
      resourceType: 'job_assignment',
      resourceId: assignmentId,
      ipAddress: req.ip,
      metadata: { job_id: deleted.job_id, assigned_date: deleted.assigned_date },
    });
    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to delete visit' });
  }
});

module.exports = router;
