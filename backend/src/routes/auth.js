const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const pool = require('../db');

const router = express.Router();

const REFRESH_TOKEN_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_ACTIVE_DEVICES = 3;

function normalizeDeviceId(value) {
  if (typeof value !== 'string') return null;
  const deviceId = value.trim();
  if (deviceId.length < 16 || deviceId.length > 200) return null;
  return deviceId;
}

function createRefreshToken() {
  return crypto.randomBytes(40).toString('hex');
}

function hashRefreshToken(refreshToken) {
  return crypto.createHash('sha256').update(refreshToken).digest('hex');
}

function createFamilyId() {
  return crypto.randomBytes(24).toString('hex');
}

function signAccessToken(userId, roles, sessionId) {
  return jwt.sign(
    { userId, roles, sessionId },
    process.env.JWT_SECRET,
    { expiresIn: '15m' }
  );
}

async function enforceDeviceLimit(client, userId, deviceId) {
  const result = await client.query(
    `SELECT COUNT(DISTINCT device_id)::int AS device_count
     FROM refresh_tokens
     WHERE user_id = $1
       AND revoked_at IS NULL
       AND expires_at > now()`,
    [userId]
  );

  const deviceCount = result.rows[0].device_count;
  if (deviceCount >= MAX_ACTIVE_DEVICES) {
    const existingDevice = await client.query(
      `SELECT 1
       FROM refresh_tokens
       WHERE user_id = $1
         AND device_id = $2
         AND revoked_at IS NULL
         AND expires_at > now()
       LIMIT 1`,
      [userId, deviceId]
    );

    if (existingDevice.rows.length === 0) {
      const err = new Error('Maximum active devices reached');
      err.code = 'DEVICE_LIMIT';
      throw err;
    }
  }

  // A fresh login on an already-authorized device replaces that device's
  // previous session rather than creating multiple sessions on one device.
  await client.query(
    `UPDATE refresh_tokens
     SET revoked_at = now()
     WHERE user_id = $1
       AND device_id = $2
       AND revoked_at IS NULL`,
    [userId, deviceId]
  );
}

async function createSession(client, userId, deviceId) {
  await enforceDeviceLimit(client, userId, deviceId);

  const refreshToken = createRefreshToken();
  const tokenHash = hashRefreshToken(refreshToken);
  const familyId = createFamilyId();
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_LIFETIME_MS);

  const result = await client.query(
    `INSERT INTO refresh_tokens
       (user_id, token_hash, expires_at, device_id, family_id, last_used_at)
     VALUES ($1, $2, $3, $4, $5, now())
     RETURNING id`,
    [userId, tokenHash, expiresAt, deviceId, familyId]
  );

  return {
    sessionId: result.rows[0].id,
    refreshToken,
  };
}

router.post('/register', async (req, res) => {
  const { full_name, username, email, phone, password } = req.body;

  if (!full_name || !username || !password) {
    return res.status(400).json({ error: 'full_name, username, and password are required' });
  }

  try {
    const password_hash = await bcrypt.hash(password, 10);

    const result = await pool.query(
      `INSERT INTO users (full_name, username, email, phone, password_hash)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, full_name, username, email, phone, role, status, created_at`,
      [full_name, username, email || null, phone || null, password_hash]
    );
    const user = result.rows[0];

    await pool.query(
      `INSERT INTO user_roles (user_id, role) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [user.id, user.role]
    );

    res.status(201).json(user);
  } catch (err) {
    if (err.code === '23505') {
      const field = err.constraint === 'users_username_unique' ? 'Username' : 'Email';
      return res.status(409).json({ error: `${field} already registered` });
    }
    console.error(err);
    res.status(500).json({ error: 'Registration failed' });
  }
});

router.post('/login', async (req, res) => {
  const { identifier, password, deviceId } = req.body;
  const normalizedDeviceId = normalizeDeviceId(deviceId);

  if (!identifier || !password) {
    return res.status(400).json({ error: 'identifier and password are required' });
  }
  if (!normalizedDeviceId) {
    return res.status(400).json({ error: 'deviceId is required' });
  }

  try {
    const result = await pool.query(
      'SELECT * FROM users WHERE (username = $1 OR email = $1) AND status = \'active\'',
      [identifier]
    );
    const user = result.rows[0];

    if (!user) {
      return res.status(401).json({ error: 'Invalid username/email or password' });
    }

    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid username/email or password' });
    }

    const rolesResult = await pool.query('SELECT role FROM user_roles WHERE user_id = $1', [
      user.id,
    ]);
    const roles = rolesResult.rows.map((r) => r.role);

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const session = await createSession(client, user.id, normalizedDeviceId);
      await client.query('COMMIT');

      const accessToken = signAccessToken(user.id, roles, session.sessionId);

      res.json({
        accessToken,
        refreshToken: session.refreshToken,
        user: {
          id: user.id,
          full_name: user.full_name,
          username: user.username,
          email: user.email,
          role: user.role,
          roles,
          tech_types: user.tech_types,
        },
      });
    } catch (err) {
      await client.query('ROLLBACK');
      if (err.code === 'DEVICE_LIMIT') {
        return res.status(409).json({
          error: 'Maximum of 3 active devices reached. Remove a device or ask an admin to revoke one.',
          code: 'DEVICE_LIMIT',
        });
      }
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Login failed' });
  }
});

router.post('/refresh', async (req, res) => {
  const { refreshToken, deviceId } = req.body;
  const normalizedDeviceId = normalizeDeviceId(deviceId);

  if (!refreshToken) {
    return res.status(400).json({ error: 'refreshToken is required' });
  }
  if (!normalizedDeviceId) {
    return res.status(400).json({ error: 'deviceId is required' });
  }

  const tokenHash = hashRefreshToken(refreshToken);
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const result = await client.query(
      'SELECT * FROM refresh_tokens WHERE token_hash = $1 FOR UPDATE',
      [tokenHash]
    );
    const stored = result.rows[0];

    if (!stored) {
      await client.query('ROLLBACK');
      return res.status(401).json({ error: 'Invalid or expired refresh token' });
    }

    // Reuse of a token that has already been rotated is treated as a
    // compromised device/session. Revoke the complete token family.
    if (stored.revoked_at || stored.replaced_by_hash) {
      await client.query(
        `UPDATE refresh_tokens
         SET revoked_at = COALESCE(revoked_at, now())
         WHERE user_id = $1 AND family_id = $2 AND revoked_at IS NULL`,
        [stored.user_id, stored.family_id]
      );
      await client.query('COMMIT');
      return res.status(401).json({
        error: 'Refresh token reuse detected; this device session has been revoked',
        code: 'REFRESH_TOKEN_REUSE',
      });
    }

    if (stored.expires_at <= new Date()) {
      await client.query('UPDATE refresh_tokens SET revoked_at = now() WHERE id = $1', [stored.id]);
      await client.query('COMMIT');
      return res.status(401).json({ error: 'Invalid or expired refresh token' });
    }

    if (stored.device_id !== normalizedDeviceId) {
      await client.query(
        `UPDATE refresh_tokens
         SET revoked_at = now()
         WHERE user_id = $1 AND family_id = $2 AND revoked_at IS NULL`,
        [stored.user_id, stored.family_id]
      );
      await client.query('COMMIT');
      return res.status(401).json({
        error: 'This refresh token is not valid for this device',
        code: 'DEVICE_MISMATCH',
      });
    }

    const userResult = await client.query(
      'SELECT * FROM users WHERE id = $1 AND status = \'active\'',
      [stored.user_id]
    );
    const user = userResult.rows[0];

    if (!user) {
      await client.query(
        'UPDATE refresh_tokens SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL',
        [stored.user_id]
      );
      await client.query('COMMIT');
      return res.status(401).json({ error: 'Account is no longer active' });
    }

    const rolesResult = await client.query(
      'SELECT role FROM user_roles WHERE user_id = $1',
      [user.id]
    );
    const roles = rolesResult.rows.map((r) => r.role);

    const newRefreshToken = createRefreshToken();
    const newTokenHash = hashRefreshToken(newRefreshToken);
    const newExpiresAt = new Date(Date.now() + REFRESH_TOKEN_LIFETIME_MS);

    const inserted = await client.query(
      `INSERT INTO refresh_tokens
         (user_id, token_hash, expires_at, device_id, family_id, last_used_at)
       VALUES ($1, $2, $3, $4, $5, now())
       RETURNING id`,
      [user.id, newTokenHash, newExpiresAt, stored.device_id, stored.family_id]
    );

    await client.query(
      `UPDATE refresh_tokens
       SET revoked_at = now(), replaced_by_hash = $1, last_used_at = now()
       WHERE id = $2`,
      [newTokenHash, stored.id]
    );

    await client.query('COMMIT');

    const accessToken = signAccessToken(user.id, roles, inserted.rows[0].id);

    res.json({
      accessToken,
      refreshToken: newRefreshToken,
      user: {
        id: user.id,
        full_name: user.full_name,
        username: user.username,
        email: user.email,
        role: user.role,
        roles,
        tech_types: user.tech_types,
      },
    });
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch {}
    console.error(err);
    res.status(500).json({ error: 'Refresh failed' });
  } finally {
    client.release();
  }
});

router.post('/logout', async (req, res) => {
  const { refreshToken } = req.body;
  if (!refreshToken) {
    return res.status(400).json({ error: 'refreshToken is required' });
  }

  try {
    const tokenHash = hashRefreshToken(refreshToken);
    await pool.query(
      'UPDATE refresh_tokens SET revoked_at = COALESCE(revoked_at, now()) WHERE token_hash = $1',
      [tokenHash]
    );
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Logout failed' });
  }
});

module.exports = router;
