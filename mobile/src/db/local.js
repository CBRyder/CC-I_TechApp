import * as SQLite from 'expo-sqlite';

let dbPromise = null;

function getDb() {
  if (!dbPromise) {
    dbPromise = SQLite.openDatabaseAsync('tracking.db');
  }
  return dbPromise;
}

// Creates the local schema if it doesn't exist yet. Safe to call every app
// launch. This local DB is the real-time source of truth for clock/job
// state on this device — the backend is a durable copy it syncs to when
// there's signal, not something the UI waits on.
export async function initDb() {
  const db = await getDb();
  await db.execAsync(`
    PRAGMA journal_mode = WAL;

    CREATE TABLE IF NOT EXISTS time_entries (
      client_id TEXT PRIMARY KEY NOT NULL,
      server_id INTEGER,
      clock_in_at TEXT NOT NULL,
      clock_out_at TEXT,
      synced INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS job_segments (
      client_id TEXT PRIMARY KEY NOT NULL,
      server_id INTEGER,
      time_entry_client_id TEXT NOT NULL,
      job_id INTEGER NOT NULL,
      state TEXT NOT NULL,
      started_at TEXT NOT NULL,
      ended_at TEXT,
      synced INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS jobs_cache (
      id INTEGER PRIMARY KEY NOT NULL,
      job_number TEXT NOT NULL,
      name TEXT NOT NULL,
      address TEXT,
      customer_name TEXT,
      status TEXT NOT NULL
    );
  `);
}

// --- time entries ---

export async function getOpenTimeEntry() {
  const db = await getDb();
  return db.getFirstAsync(
    `SELECT * FROM time_entries WHERE clock_out_at IS NULL ORDER BY clock_in_at DESC LIMIT 1`
  );
}

export async function createTimeEntry(clientId, clockInAt) {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO time_entries (client_id, clock_in_at, synced) VALUES (?, ?, 0)`,
    [clientId, clockInAt]
  );
}

export async function setTimeEntryClockOut(clientId, clockOutAt) {
  const db = await getDb();
  await db.runAsync(
    `UPDATE time_entries SET clock_out_at = ?, synced = 0 WHERE client_id = ?`,
    [clockOutAt, clientId]
  );
}

export async function markTimeEntrySynced(clientId, serverId) {
  const db = await getDb();
  await db.runAsync(`UPDATE time_entries SET synced = 1, server_id = ? WHERE client_id = ?`, [
    serverId,
    clientId,
  ]);
}

export async function getUnsyncedTimeEntries() {
  const db = await getDb();
  return db.getAllAsync(`SELECT * FROM time_entries WHERE synced = 0`);
}

// --- job segments ---

export async function getActiveSegment(timeEntryClientId) {
  const db = await getDb();
  return db.getFirstAsync(
    `SELECT js.*, j.job_number, j.name, j.address, j.customer_name
     FROM job_segments js
     LEFT JOIN jobs_cache j ON j.id = js.job_id
     WHERE js.time_entry_client_id = ? AND js.ended_at IS NULL
     ORDER BY js.started_at DESC LIMIT 1`,
    [timeEntryClientId]
  );
}

export async function createSegment(clientId, timeEntryClientId, jobId, state, startedAt) {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO job_segments (client_id, time_entry_client_id, job_id, state, started_at, synced)
     VALUES (?, ?, ?, ?, ?, 0)`,
    [clientId, timeEntryClientId, jobId, state, startedAt]
  );
}

export async function endSegment(clientId, endedAt) {
  const db = await getDb();
  await db.runAsync(`UPDATE job_segments SET ended_at = ?, synced = 0 WHERE client_id = ?`, [
    endedAt,
    clientId,
  ]);
}

export async function markSegmentSynced(clientId, serverId) {
  const db = await getDb();
  await db.runAsync(`UPDATE job_segments SET synced = 1, server_id = ? WHERE client_id = ?`, [
    serverId,
    clientId,
  ]);
}

// Only segments whose parent time entry is already synced can sync
// themselves (the backend needs the parent to exist first).
export async function getUnsyncedSegmentsWithSyncedParent() {
  const db = await getDb();
  return db.getAllAsync(
    `SELECT js.* FROM job_segments js
     JOIN time_entries te ON te.client_id = js.time_entry_client_id
     WHERE js.synced = 0 AND te.synced = 1`
  );
}

// --- jobs cache (so job selection works with no signal) ---

export async function replaceJobsCache(jobs) {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    await db.runAsync(`DELETE FROM jobs_cache`);
    for (const job of jobs) {
      await db.runAsync(
        `INSERT INTO jobs_cache (id, job_number, name, address, customer_name, status)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [job.id, job.job_number, job.name, job.address ?? null, job.customer_name ?? null, job.status]
      );
    }
  });
}

export async function getCachedJobs() {
  const db = await getDb();
  return db.getAllAsync(`SELECT * FROM jobs_cache WHERE status = 'open' ORDER BY job_number`);
}
