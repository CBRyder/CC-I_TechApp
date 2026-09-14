require('dotenv').config();
const express = require('express');
const authRoutes = require('./routes/auth');
const jobsRoutes = require('./routes/jobs');
const timeEntriesRoutes = require('./routes/timeEntries');
const jobSegmentsRoutes = require('./routes/jobSegments');
const partsRoutes = require('./routes/parts');
const jobCompletionsRoutes = require('./routes/jobCompletions');
const requireAuth = require('./middleware/auth');
const pool = require('./db');

const app = express();

app.use(express.json());

app.get('/', (req, res) => {
  res.json({ status: 'ok', service: 'cc-i-techapp-backend' });
});

app.use('/auth', authRoutes);
app.use('/jobs', jobsRoutes);
app.use('/time-entries', timeEntriesRoutes);
app.use('/job-segments', jobSegmentsRoutes);
app.use('/parts', partsRoutes);
app.use('/job-completions', jobCompletionsRoutes);

app.get('/me', requireAuth, async (req, res) => {
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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
