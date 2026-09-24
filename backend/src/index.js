require('dotenv').config();
const express = require('express');
const authRoutes = require('./routes/auth');
const jobsRoutes = require('./routes/jobs');
const timeEntriesRoutes = require('./routes/timeEntries');
const jobSegmentsRoutes = require('./routes/jobSegments');
const partsRoutes = require('./routes/parts');
const jobCompletionsRoutes = require('./routes/jobCompletions');
const meRoutes = require('./routes/me');
const preferencesRoutes = require('./routes/preferences');
const timesheetRoutes = require('./routes/timesheet');
const adminRoutes = require('./routes/admin');

const app = express();

// Render sits behind a trusted reverse proxy. This makes req.ip represent
// the connecting client IP instead of the proxy address, which is needed for
// login abuse controls. Do not trust arbitrary forwarded hops.
app.set('trust proxy', 1);

// JSON endpoints never need large request bodies; photos upload directly to private R2.
app.use(express.json({ limit: '100kb' }));

app.get('/', (req, res) => {
  res.json({ status: 'ok', service: 'cc-i-techapp-backend' });
});

app.use('/auth', authRoutes);
app.use('/jobs', jobsRoutes);
app.use('/time-entries', timeEntriesRoutes);
app.use('/job-segments', jobSegmentsRoutes);
app.use('/parts', partsRoutes);
app.use('/job-completions', jobCompletionsRoutes);
app.use('/me', meRoutes);
app.use('/preferences', preferencesRoutes);
app.use('/timesheet', timesheetRoutes);
app.use('/admin', adminRoutes);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
