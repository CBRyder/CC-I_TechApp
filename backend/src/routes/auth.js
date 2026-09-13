const express = require('express');
const bcrypt = require('bcrypt');
const pool = require('../db');

const router = express.Router();

router.post('/register', async (req, res) => {
  const { full_name, email, phone, password } = req.body;

  if (!full_name || !email || !password) {
    return res.status(400).json({ error: 'full_name, email, and password are required' });
  }

  try {
    const password_hash = await bcrypt.hash(password, 10);

    const result = await pool.query(
      `INSERT INTO users (full_name, email, phone, password_hash)
       VALUES ($1, $2, $3, $4)
       RETURNING id, full_name, email, phone, role, status, created_at`,
      [full_name, email, phone || null, password_hash]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Email already registered' });
    }
    console.error(err);
    res.status(500).json({ error: 'Registration failed' });
  }
});

module.exports = router;
