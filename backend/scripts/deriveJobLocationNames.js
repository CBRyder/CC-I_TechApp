require('dotenv').config();
const pool = require('../src/db');

// One-off backfill for jobs created before location_name existed (migration
// 012) — customer_name already works fine as the "umbrella," but
// location_name is new and blank on anything seeded earlier. Existing job
// names look like "HVAC Install - Riverside Office" (work type + site
// mashed together); this splits on the first " - " and uses the back half
// as a reasonable starting location_name. Never overwrites one that's
// already set — safe to re-run.
//
// Usage: node scripts/deriveJobLocationNames.js
async function main() {
  try {
    const { rows: jobs } = await pool.query(
      'SELECT id, name, location_name FROM jobs WHERE location_name IS NULL'
    );
    for (const job of jobs) {
      const dashIndex = job.name.indexOf(' - ');
      const derived = dashIndex === -1 ? job.name : job.name.slice(dashIndex + 3);
      await pool.query('UPDATE jobs SET location_name = $1 WHERE id = $2', [derived, job.id]);
      console.log(`Job ${job.id} ("${job.name}"): location_name = "${derived}"`);
    }
    if (jobs.length === 0) {
      console.log('No jobs needed a location_name — nothing to do.');
    }
  } catch (err) {
    console.error('Failed:', err.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main();
