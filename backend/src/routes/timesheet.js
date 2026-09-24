const express = require('express');
const pool = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_RANGE_DAYS = 92;

function parseRange(query) {
  const { start, end } = query;
  if (!start || !end || !DATE_RE.test(start) || !DATE_RE.test(end)) return null;
  if (end < start) return null;
  const days = (new Date(end) - new Date(start)) / 86400000;
  if (days > MAX_RANGE_DAYS) return null;
  return { start, end };
}

// Daily hours (from time_entries) and billable hours (travel + work job_segments,
// only finished ones — an in-progress segment isn't a finalized timesheet fact
// yet), bucketed by the same UTC calendar date the mobile app already uses for
// its local, device-only hours history (see mobile/src/db/local.js).
async function buildTimesheet(userId, start, end) {
  const dailyResult = await pool.query(
    `SELECT to_char(clock_in_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS date,
            SUM(EXTRACT(EPOCH FROM (COALESCE(clock_out_at, now()) - clock_in_at))) / 3600.0 AS daily_hours
     FROM time_entries
     WHERE user_id = $1 AND (clock_in_at AT TIME ZONE 'UTC')::date BETWEEN $2 AND $3
     GROUP BY 1`,
    [userId, start, end]
  );

  const billableByDateResult = await pool.query(
    `SELECT to_char(started_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS date,
            SUM(EXTRACT(EPOCH FROM (COALESCE(ended_at, now()) - started_at))) / 3600.0 AS billable_hours
     FROM job_segments
     WHERE user_id = $1 AND state IN ('travel', 'work') AND ended_at IS NOT NULL
       AND (started_at AT TIME ZONE 'UTC')::date BETWEEN $2 AND $3
     GROUP BY 1`,
    [userId, start, end]
  );
  const billableByDate = new Map(billableByDateResult.rows.map((r) => [r.date, Number(r.billable_hours)]));

  const days = dailyResult.rows
    .map((r) => {
      const dailyHours = Number(r.daily_hours);
      const billableHours = billableByDate.get(r.date) || 0;
      return {
        date: r.date,
        daily_hours: dailyHours,
        billable_hours: billableHours,
        non_billable_hours: dailyHours - billableHours,
      };
    })
    .sort((a, b) => (a.date < b.date ? -1 : 1));

  const jobsResult = await pool.query(
    `SELECT js.job_id, j.job_number, j.name AS job_name,
            SUM(CASE WHEN js.state = 'travel'
                     THEN EXTRACT(EPOCH FROM (COALESCE(js.ended_at, now()) - js.started_at)) / 3600.0
                     ELSE 0 END) AS travel_hours,
            SUM(CASE WHEN js.state = 'work'
                     THEN EXTRACT(EPOCH FROM (COALESCE(js.ended_at, now()) - js.started_at)) / 3600.0
                     ELSE 0 END) AS work_hours
     FROM job_segments js
     JOIN jobs j ON j.id = js.job_id
     WHERE js.user_id = $1 AND js.state IN ('travel', 'work') AND js.ended_at IS NOT NULL
       AND (js.started_at AT TIME ZONE 'UTC')::date BETWEEN $2 AND $3
     GROUP BY js.job_id, j.job_number, j.name
     ORDER BY j.job_number`,
    [userId, start, end]
  );
  const jobs = jobsResult.rows.map((r) => {
    const travelHours = Number(r.travel_hours);
    const workHours = Number(r.work_hours);
    return {
      job_id: r.job_id,
      job_number: r.job_number,
      job_name: r.job_name,
      travel_hours: travelHours,
      work_hours: workHours,
      billable_hours: travelHours + workHours,
    };
  });

  const totals = days.reduce(
    (acc, d) => ({
      daily_hours: acc.daily_hours + d.daily_hours,
      billable_hours: acc.billable_hours + d.billable_hours,
      non_billable_hours: acc.non_billable_hours + d.non_billable_hours,
    }),
    { daily_hours: 0, billable_hours: 0, non_billable_hours: 0 }
  );

  return { start, end, days, jobs, totals };
}

router.get('/', requireAuth, async (req, res) => {
  const range = parseRange(req.query);
  if (!range) {
    return res.status(400).json({ error: 'start and end (YYYY-MM-DD, end >= start, 92 days max) are required' });
  }
  try {
    const data = await buildTimesheet(req.user.userId, range.start, range.end);
    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to build timesheet' });
  }
});

module.exports = router;
module.exports.buildTimesheet = buildTimesheet;
module.exports.parseRange = parseRange;
