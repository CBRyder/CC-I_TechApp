const pool = require('./db');

function displayName(fullName) {
  const parts = String(fullName || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2) return parts[0] || null;
  return `${parts[0]} ${parts[parts.length - 1].slice(-1).toUpperCase()}.`;
}

async function audit({
  actorUserId = null,
  targetUserId = null,
  action,
  resourceType = null,
  resourceId = null,
  ipAddress = null,
  metadata = {},
}) {
  let actorDisplayName = null;

  if (actorUserId != null) {
    const result = await pool.query('SELECT full_name FROM users WHERE id = $1', [actorUserId]);
    actorDisplayName = result.rows[0] ? displayName(result.rows[0].full_name) : null;
  }

  await pool.query(
    `INSERT INTO audit_events
       (actor_user_id, actor_display_name, action, target_user_id,
        resource_type, resource_id, ip_address, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)`,
    [
      actorUserId,
      actorDisplayName,
      action,
      targetUserId,
      resourceType,
      resourceId == null ? null : String(resourceId),
      ipAddress || null,
      JSON.stringify(metadata || {}),
    ]
  );
}

module.exports = { audit, displayName };
