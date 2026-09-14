const express = require('express');
const pool = require('../db');
const requireAuth = require('../middleware/auth');

const router = express.Router();

router.get('/', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, category, name, unit
       FROM parts_catalog
       WHERE status = 'active'
       ORDER BY category, name`
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch parts' });
  }
});

module.exports = router;
