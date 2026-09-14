require('dotenv').config();
const fs = require('fs');
const path = require('path');
const pool = require('../src/db');

const migrationsDir = path.join(__dirname, '../migrations');

async function migrate() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        filename TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);

    const files = fs
      .readdirSync(migrationsDir)
      .filter((f) => f.endsWith('.sql'))
      .sort();

    for (const file of files) {
      const already = await pool.query(
        'SELECT 1 FROM schema_migrations WHERE filename = $1',
        [file]
      );
      if (already.rows.length > 0) {
        console.log(`Skipping ${file} (already applied)`);
        continue;
      }

      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
      await pool.query('BEGIN');
      try {
        await pool.query(sql);
        await pool.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [file]);
        await pool.query('COMMIT');
        console.log(`Applied ${file}`);
      } catch (err) {
        await pool.query('ROLLBACK');
        throw err;
      }
    }

    console.log('Migrations complete.');
  } catch (err) {
    console.error('Migration failed:', err.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

migrate();
