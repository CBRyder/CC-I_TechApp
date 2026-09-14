const express = require('express');
const pool = require('../db');
const requireAuth = require('../middleware/auth');

const router = express.Router();

// Returns all of the caller's preferences as a flat { key: value } object —
// simplest shape for the mobile app to cache and read from directly.
router.get('/', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT key, value FROM user_preferences WHERE user_id = $1`,
      [req.user.userId]
    );
    const preferences = {};
    for (const row of result.rows) preferences[row.key] = row.value;
    res.json(preferences);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch preferences' });
  }
});

router.put('/:key', requireAuth, async (req, res) => {
  const { key } = req.params;
  const { value } = req.body;

  try {
    await pool.query(
      `INSERT INTO user_preferences (user_id, key, value)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id, key) DO UPDATE SET value = EXCLUDED.value`,
      [req.user.userId, key, value ?? null]
    );
    res.json({ key, value: value ?? null });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to save preference' });
  }
});

module.exports = router;
