const express = require('express');
const pool = require('../db');
const requireAuth = require('../middleware/auth');

const router = express.Router();

router.get('/', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, job_number, name, address, customer_name, status
       FROM jobs
       WHERE status = 'open'
       ORDER BY job_number`
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch jobs' });
  }
});

module.exports = router;
