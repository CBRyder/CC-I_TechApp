const express = require('express');
const bcrypt = require('bcrypt');
const pool = require('../db');
const requireAuth = require('../middleware/auth');

const router = express.Router();

router.get('/', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, full_name, email, phone, role, status, created_at FROM users WHERE id = $1',
      [req.user.userId]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch user' });
  }
});

// Email is intentionally not editable here — it's the login identifier and
// changing it safely needs its own verification flow, out of scope for now.
router.patch('/', requireAuth, async (req, res) => {
  const { full_name, phone } = req.body;

  if (full_name !== undefined && !full_name.trim()) {
    return res.status(400).json({ error: 'full_name cannot be empty' });
  }

  try {
    const result = await pool.query(
      `UPDATE users SET
         full_name = COALESCE($1, full_name),
         phone = COALESCE($2, phone)
       WHERE id = $3
       RETURNING id, full_name, email, phone, role, status, created_at`,
      [full_name ?? null, phone ?? null, req.user.userId]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

router.post('/change-password', requireAuth, async (req, res) => {
  const { current_password, new_password } = req.body;

  if (!current_password || !new_password) {
    return res.status(400).json({ error: 'current_password and new_password are required' });
  }
  if (new_password.length < 8) {
    return res.status(400).json({ error: 'new_password must be at least 8 characters' });
  }

  try {
    const userResult = await pool.query('SELECT password_hash FROM users WHERE id = $1', [
      req.user.userId,
    ]);
    const user = userResult.rows[0];

    const validCurrent = await bcrypt.compare(current_password, user.password_hash);
    if (!validCurrent) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }

    const newHash = await bcrypt.hash(new_password, 10);
    await pool.query('UPDATE users SET password_hash = $1 WHERE id = $2', [
      newHash,
      req.user.userId,
    ]);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to change password' });
  }
});

module.exports = router;
