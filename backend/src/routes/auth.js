const express = require('express');
const bcrypt = require('bcrypt');
const pool = require('../db');

const router = express.Router();

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

    // Every account starts with just its default role — admin (or any
    // other extra role) has to be granted separately, never self-service.
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

const jwt = require('jsonwebtoken');

router.post('/login', async (req, res) => {
  const { identifier, password } = req.body;

  if (!identifier || !password) {
    return res.status(400).json({ error: 'identifier and password are required' });
  }

  try {
    const result = await pool.query(
      'SELECT * FROM users WHERE username = $1 OR email = $1',
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

    const accessToken = jwt.sign(
      { userId: user.id, roles },
      process.env.JWT_SECRET,
      { expiresIn: '15m' }
    );

    const refreshToken = crypto.randomBytes(40).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

    await pool.query(
      'INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)',
      [user.id, tokenHash, expiresAt]
    );

    res.json({
      accessToken,
      refreshToken,
      user: {
        id: user.id,
        full_name: user.full_name,
        username: user.username,
        email: user.email,
        role: user.role,
        roles,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Login failed' });
  }
});

const crypto = require('crypto');

router.post('/refresh', async (req, res) => {
  const { refreshToken } = req.body;

  if (!refreshToken) {
    return res.status(400).json({ error: 'refreshToken is required' });
  }

  try {
    const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');

    const result = await pool.query(
      'SELECT * FROM refresh_tokens WHERE token_hash = $1 AND expires_at > now()',
      [tokenHash]
    );
    const stored = result.rows[0];

    if (!stored) {
      return res.status(401).json({ error: 'Invalid or expired refresh token' });
    }

    const userResult = await pool.query('SELECT * FROM users WHERE id = $1', [stored.user_id]);
    const user = userResult.rows[0];

    const rolesResult = await pool.query('SELECT role FROM user_roles WHERE user_id = $1', [
      user.id,
    ]);
    const roles = rolesResult.rows.map((r) => r.role);

    const accessToken = jwt.sign(
      { userId: user.id, roles },
      process.env.JWT_SECRET,
      { expiresIn: '15m' }
    );

    res.json({ accessToken });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Refresh failed' });
  }
});


module.exports = router;
