require('dotenv').config();
const pool = require('../src/db');

// One-off: hard-delete a throwaway test account by username (and its
// sessions), created during verification of the refresh-token grace-period
// fix. Refuses to run against accounts with any real job history.
//
// Usage: node scripts/deleteTestUser.js <username>
async function main() {
  const username = process.argv[2];
  if (!username) {
    console.error('Usage: node scripts/deleteTestUser.js <username>');
    process.exitCode = 1;
    return;
  }

  try {
    const userResult = await pool.query('SELECT id FROM users WHERE username = $1', [username]);
    const user = userResult.rows[0];
    if (!user) {
      console.log(`${username}: no such user, skipping`);
      return;
    }

    const assignments = await pool.query('SELECT COUNT(*)::int AS n FROM job_assignments WHERE user_id = $1', [user.id]);
    if (assignments.rows[0].n > 0) {
      console.error(`${username}: has ${assignments.rows[0].n} job assignment(s), refusing to delete`);
      process.exitCode = 1;
      return;
    }

    await pool.query('DELETE FROM refresh_tokens WHERE user_id = $1', [user.id]);
    await pool.query('DELETE FROM users WHERE id = $1', [user.id]);
    console.log(`${username}: deleted`);
  } catch (err) {
    console.error('Failed:', err.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main();
