require('dotenv').config();
const pool = require('../src/db');

// One-off: revoke every active session for the given username(s), freeing
// up their device slots (MAX_ACTIVE_DEVICES = 3 in auth.js). For clearing
// out test sessions that filled an account's device quota.
//
// Usage: node scripts/revokeAllSessions.js <username> [username2 ...]
async function main() {
  const usernames = process.argv.slice(2);
  if (usernames.length === 0) {
    console.error('Usage: node scripts/revokeAllSessions.js <username> [username2 ...]');
    process.exitCode = 1;
    return;
  }

  try {
    for (const username of usernames) {
      const userResult = await pool.query('SELECT id FROM users WHERE username = $1', [username]);
      const user = userResult.rows[0];
      if (!user) {
        console.log(`${username}: no such user, skipping`);
        continue;
      }
      const result = await pool.query(
        `UPDATE refresh_tokens SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL RETURNING id`,
        [user.id]
      );
      console.log(`${username}: revoked ${result.rowCount} active session(s)`);
    }
  } catch (err) {
    console.error('Failed:', err.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main();
