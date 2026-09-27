const { Pool } = require('pg');

// Hosted Postgres (Render, etc.) requires SSL; local dev doesn't offer it.
const isLocal = /localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL || '');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: isLocal ? false : { rejectUnauthorized: false },
});

// Every "which day was this?" question — timesheet days, deleting a day or
// week of hours, matching a visit's work to its assigned date — is answered
// by casting a timestamp to a date, which Postgres does in the session's
// time zone. Render's database runs in UTC, which put anything after ~8 PM
// Eastern on the next day. Pin each connection to the business's own time
// zone instead (the phones already use local dates).
const BUSINESS_TIME_ZONE = process.env.BUSINESS_TIME_ZONE || 'America/New_York';
pool.on('connect', (client) => {
  client.query('SELECT set_config($1, $2, false)', ['TimeZone', BUSINESS_TIME_ZONE]).catch((err) => {
    console.error(`Failed to set time zone ${BUSINESS_TIME_ZONE}:`, err.message);
  });
});

module.exports = pool;
module.exports.BUSINESS_TIME_ZONE = BUSINESS_TIME_ZONE;
