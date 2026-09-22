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

    // Access tokens issued by the hardened auth flow are bound to a server
    // session. Revoking that session therefore takes effect immediately,
    // rather than waiting for the 15-minute access token to expire.
    if (payload.sessionId) {
      const sessionResult = await pool.query(
        `SELECT id
         FROM refresh_tokens
         WHERE id = $1
           AND user_id = $2
           AND revoked_at IS NULL
           AND expires_at > now()`,
        [payload.sessionId, payload.userId]
      );
      if (sessionResult.rows.length === 0) {
        return res.status(401).json({ error: 'Session has been revoked or expired' });
      }
    }

    req.user = payload;
    next();
  } catch (err) {
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
