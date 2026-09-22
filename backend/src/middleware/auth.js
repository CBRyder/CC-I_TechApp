const jwt = require('jsonwebtoken');
const pool = require('../db');

async function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid authorization header' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);

    // JWT claims are not authoritative for account status or roles. Checking
    // the account on each request makes deletion/revocation effective
    // immediately instead of waiting for the 15-minute access token to expire.
    const result = await pool.query(
      `SELECT u.id, u.status,
              COALESCE(array_agg(ur.role) FILTER (WHERE ur.role IS NOT NULL), '{}') AS roles
       FROM users u
       LEFT JOIN user_roles ur ON ur.user_id = u.id
       WHERE u.id = $1
       GROUP BY u.id`,
      [payload.userId]
    );
    const user = result.rows[0];

    if (!user || user.status !== 'active') {
      return res.status(401).json({ error: 'Account is no longer active' });
    }

    req.user = {
      ...payload,
      userId: user.id,
      roles: user.roles,
    };
    next();
  } catch (err) {
    if (err.name !== 'JsonWebTokenError' && err.name !== 'TokenExpiredError') {
      console.error(err);
    }
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

function requireRole(role) {
  return (req, res, next) => {
    if (!req.user?.roles?.includes(role)) {
      return res.status(403).json({ error: `Requires the ${role} role` });
    }
    next();
  };
}

module.exports = requireAuth;
module.exports.requireAuth = requireAuth;
module.exports.requireRole = requireRole;
