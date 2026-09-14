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
const adminRoutes = require('./routes/admin');

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
app.use('/me', meRoutes);
app.use('/preferences', preferencesRoutes);
app.use('/admin', adminRoutes);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
