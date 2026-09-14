const jwt = require('jsonwebtoken');

function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid authorization header' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = payload;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// A user can hold more than one role (see migration 008) — the JWT carries
// all of them as `roles`, refreshed whenever the access token is. Use
// alongside requireAuth: `router.post('/x', requireAuth, requireRole('admin'), ...)`.
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
