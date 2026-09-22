require('dotenv').config();
const pool = require('../src/db');

// Clears all hours and visit history (time entries, job segments,
// completions, parts used, photos, and the assignments themselves) while
// leaving accounts and the job catalog untouched. Deletes in FK-safe
// order — children before the parents they reference.
//
// Usage: node scripts/resetWorkHistory.js
async function main() {
  try {
    await pool.query('BEGIN');
    await pool.query('DELETE FROM job_completion_photos');
    await pool.query('DELETE FROM job_completion_parts');
    await pool.query('DELETE FROM job_completions');
    await pool.query('DELETE FROM job_segments');
    await pool.query('DELETE FROM time_entries');
    await pool.query('DELETE FROM job_assignments');
    await pool.query('COMMIT');
    console.log('Cleared all hours and visit history. Accounts and the job catalog are untouched.');
  } catch (err) {
    await pool.query('ROLLBACK').catch(() => {});
    console.error('Failed:', err.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main();
