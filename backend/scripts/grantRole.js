require('dotenv').config();
const pool = require('../src/db');

// Roles are never self-service (see auth.js's register comment) — this is
// the deliberate side door: run it directly against the database (e.g.
// from Render's Shell tab) to promote a test account.
//
// Usage: node scripts/grantRole.js <username-or-email> <role> [--only]
//   --only  also removes every other role the account currently holds,
//           so it ends up with exactly this one (e.g. a pure-admin test
//           account with no tech role).
async function main() {
  const [, , identifier, role] = process.argv;
  const only = process.argv.includes('--only');

  if (!identifier || !role) {
    console.error('Usage: node scripts/grantRole.js <username-or-email> <role> [--only]');
    process.exitCode = 1;
    return;
  }

  try {
    const userResult = await pool.query(
      'SELECT id, full_name, username FROM users WHERE username = $1 OR email = $1',
      [identifier]
    );
    const user = userResult.rows[0];
    if (!user) {
      console.error(`No user found matching "${identifier}"`);
      process.exitCode = 1;
      return;
    }

    if (only) {
      await pool.query('DELETE FROM user_roles WHERE user_id = $1', [user.id]);
    }
    await pool.query(
      'INSERT INTO user_roles (user_id, role) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [user.id, role]
    );

    const rolesResult = await pool.query('SELECT role FROM user_roles WHERE user_id = $1', [
      user.id,
    ]);
    console.log(
      `${user.full_name} (${user.username}) now has roles: ${rolesResult.rows.map((r) => r.role).join(', ')}`
    );
    console.log('Log out and back in on the device to pick up the new role (it\'s baked into the access token).');
  } catch (err) {
    console.error('Failed:', err.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main();
