import * as SQLite from 'expo-sqlite';

let dbPromise = null;

function getDb() {
  if (!dbPromise) {
    dbPromise = SQLite.openDatabaseAsync('tracking.db');
  }
  return dbPromise;
}

// expo-sqlite can't handle two withTransactionAsync calls overlapping on
// the same connection — one's cleanup collides with the other's and it
// throws "cannot rollback, no transaction is active." That's easy to hit
// here: TrackingContext's login effect and a screen's own focus-effect
// reads can genuinely run around the same moment. Every transaction in this
// file goes through runTransaction instead of calling
// db.withTransactionAsync directly, so only one is ever in flight globally,
// no matter which component/effect kicked it off.
let transactionQueue = Promise.resolve();
async function runTransaction(fn) {
  const db = await getDb();
  const result = transactionQueue.then(() => db.withTransactionAsync(() => fn(db)));
  // Swallow here so one failed transaction doesn't wedge the queue for
  // everything queued after it — the caller below still gets the real error.
  transactionQueue = result.catch(() => {});
  return result;
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

    CREATE TABLE IF NOT EXISTS parts_cache (
      id INTEGER PRIMARY KEY NOT NULL,
      category TEXT NOT NULL,
      name TEXT NOT NULL,
      unit TEXT NOT NULL
    );

    -- Always holds just the most recently fetched assigned-jobs list (one
    -- date at a time — Home only ever needs "today").
    CREATE TABLE IF NOT EXISTS assigned_jobs_cache (
      id INTEGER PRIMARY KEY NOT NULL,
      job_number TEXT NOT NULL,
      name TEXT NOT NULL,
      address TEXT,
      customer_name TEXT,
      status TEXT NOT NULL
    );

    -- Created the instant "Finish" is tapped (queues the job for
    -- completion); filled in and submitted whenever the tech gets to it.
    CREATE TABLE IF NOT EXISTS job_completions (
      client_id TEXT PRIMARY KEY NOT NULL,
      server_id INTEGER,
      job_segment_client_id TEXT NOT NULL,
      visit_summary TEXT,
      submitted_at TEXT,
      synced INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS job_completion_parts (
      client_id TEXT PRIMARY KEY NOT NULL,
      server_id INTEGER,
      job_completion_client_id TEXT NOT NULL,
      part_id INTEGER NOT NULL,
      quantity INTEGER NOT NULL DEFAULT 1,
      synced INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS job_completion_photos (
      client_id TEXT PRIMARY KEY NOT NULL,
      server_id INTEGER,
      job_completion_client_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      local_uri TEXT NOT NULL,
      uploaded INTEGER NOT NULL DEFAULT 0
    );

    -- Device-only settings (never synced — e.g. theme is a per-device
    -- display preference, meaningless to carry to another phone).
    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY NOT NULL,
      value TEXT
    );

    -- Read-through cache of the server's user_preferences, so a synced
    -- preference (like preferred categories) still applies with no signal.
    -- Writes go straight to the server (see SettingsContext) — this is only
    -- refreshed after a successful write or an explicit reload.
    CREATE TABLE IF NOT EXISTS preferences_cache (
      key TEXT PRIMARY KEY NOT NULL,
      value TEXT
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
  await runTransaction(async (db) => {
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

// --- assigned jobs cache ("today's jobs" for Home — one date at a time) ---

export async function replaceAssignedJobsCache(jobs) {
  await runTransaction(async (db) => {
    await db.runAsync(`DELETE FROM assigned_jobs_cache`);
    for (const job of jobs) {
      await db.runAsync(
        `INSERT INTO assigned_jobs_cache (id, job_number, name, address, customer_name, status)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [job.id, job.job_number, job.name, job.address ?? null, job.customer_name ?? null, job.status]
      );
    }
  });
}

export async function getCachedAssignedJobs() {
  const db = await getDb();
  return db.getAllAsync(`SELECT * FROM assigned_jobs_cache ORDER BY job_number`);
}

// --- parts catalog cache (so the parts picker works with no signal) ---

export async function replacePartsCache(parts) {
  await runTransaction(async (db) => {
    await db.runAsync(`DELETE FROM parts_cache`);
    for (const part of parts) {
      await db.runAsync(`INSERT INTO parts_cache (id, category, name, unit) VALUES (?, ?, ?, ?)`, [
        part.id,
        part.category,
        part.name,
        part.unit,
      ]);
    }
  });
}

export async function getCachedParts() {
  const db = await getDb();
  return db.getAllAsync(`SELECT * FROM parts_cache ORDER BY category, name`);
}

// --- job completions ---

export async function createJobCompletion(clientId, jobSegmentClientId) {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO job_completions (client_id, job_segment_client_id, synced) VALUES (?, ?, 0)`,
    [clientId, jobSegmentClientId]
  );
}

// Completions not yet submitted — the tech's "still needs details" queue.
export async function getPendingCompletions() {
  const db = await getDb();
  return db.getAllAsync(
    `SELECT jc.*, js.job_id, j.job_number, j.name AS job_name
     FROM job_completions jc
     LEFT JOIN job_segments js ON js.client_id = jc.job_segment_client_id
     LEFT JOIN jobs_cache j ON j.id = js.job_id
     WHERE jc.submitted_at IS NULL
     ORDER BY js.started_at DESC`
  );
}

export async function getJobCompletion(clientId) {
  const db = await getDb();
  return db.getFirstAsync(
    `SELECT jc.*, js.job_id, j.job_number, j.name AS job_name, j.address, j.customer_name
     FROM job_completions jc
     LEFT JOIN job_segments js ON js.client_id = jc.job_segment_client_id
     LEFT JOIN jobs_cache j ON j.id = js.job_id
     WHERE jc.client_id = ?`,
    [clientId]
  );
}

export async function updateCompletionSummary(clientId, visitSummary) {
  const db = await getDb();
  await db.runAsync(`UPDATE job_completions SET visit_summary = ?, synced = 0 WHERE client_id = ?`, [
    visitSummary,
    clientId,
  ]);
}

export async function markCompletionSubmitted(clientId, submittedAt) {
  const db = await getDb();
  await db.runAsync(`UPDATE job_completions SET submitted_at = ?, synced = 0 WHERE client_id = ?`, [
    submittedAt,
    clientId,
  ]);
}

export async function markCompletionSynced(clientId, serverId) {
  const db = await getDb();
  await db.runAsync(`UPDATE job_completions SET synced = 1, server_id = ? WHERE client_id = ?`, [
    serverId,
    clientId,
  ]);
}

export async function getUnsyncedCompletions() {
  const db = await getDb();
  return db.getAllAsync(`SELECT * FROM job_completions WHERE synced = 0`);
}

// --- completion parts (parts used on a job) ---

export async function addCompletionPart(clientId, completionClientId, partId, quantity) {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO job_completion_parts (client_id, job_completion_client_id, part_id, quantity, synced)
     VALUES (?, ?, ?, ?, 0)`,
    [clientId, completionClientId, partId, quantity]
  );
}

export async function removeCompletionPart(clientId) {
  const db = await getDb();
  await db.runAsync(`DELETE FROM job_completion_parts WHERE client_id = ?`, [clientId]);
}

export async function getCompletionParts(completionClientId) {
  const db = await getDb();
  return db.getAllAsync(
    `SELECT jcp.*, p.category, p.name, p.unit
     FROM job_completion_parts jcp
     LEFT JOIN parts_cache p ON p.id = jcp.part_id
     WHERE jcp.job_completion_client_id = ?`,
    [completionClientId]
  );
}

export async function markCompletionPartSynced(clientId, serverId) {
  const db = await getDb();
  await db.runAsync(
    `UPDATE job_completion_parts SET synced = 1, server_id = ? WHERE client_id = ?`,
    [serverId, clientId]
  );
}

// Only parts whose parent completion is already synced can sync themselves.
export async function getUnsyncedPartsWithSyncedParent() {
  const db = await getDb();
  return db.getAllAsync(
    `SELECT jcp.* FROM job_completion_parts jcp
     JOIN job_completions jc ON jc.client_id = jcp.job_completion_client_id
     WHERE jcp.synced = 0 AND jc.synced = 1`
  );
}

// --- completion photos ---

export async function addCompletionPhoto(clientId, completionClientId, kind, localUri) {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO job_completion_photos (client_id, job_completion_client_id, kind, local_uri, uploaded)
     VALUES (?, ?, ?, ?, 0)`,
    [clientId, completionClientId, kind, localUri]
  );
}

export async function getCompletionPhotos(completionClientId) {
  const db = await getDb();
  return db.getAllAsync(
    `SELECT * FROM job_completion_photos WHERE job_completion_client_id = ? ORDER BY kind`,
    [completionClientId]
  );
}

export async function markPhotoUploaded(clientId) {
  const db = await getDb();
  await db.runAsync(`UPDATE job_completion_photos SET uploaded = 1 WHERE client_id = ?`, [clientId]);
}

// Only photos whose parent completion is already synced can upload.
export async function getUnuploadedPhotosWithSyncedParent() {
  const db = await getDb();
  return db.getAllAsync(
    `SELECT jcp.* FROM job_completion_photos jcp
     JOIN job_completions jc ON jc.client_id = jcp.job_completion_client_id
     WHERE jcp.uploaded = 0 AND jc.synced = 1`
  );
}

// --- device-only app settings (theme, etc. — never synced) ---

export async function getAppSetting(key) {
  const db = await getDb();
  const row = await db.getFirstAsync(`SELECT value FROM app_settings WHERE key = ?`, [key]);
  return row?.value ?? null;
}

export async function setAppSetting(key, value) {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO app_settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [key, value]
  );
}

// --- synced preferences cache (read-through; writes go to the server) ---

export async function getCachedPreference(key) {
  const db = await getDb();
  const row = await db.getFirstAsync(`SELECT value FROM preferences_cache WHERE key = ?`, [key]);
  return row?.value ?? null;
}

export async function getAllCachedPreferences() {
  const db = await getDb();
  const rows = await db.getAllAsync(`SELECT key, value FROM preferences_cache`);
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

export async function setCachedPreference(key, value) {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO preferences_cache (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [key, value]
  );
}

export async function replacePreferencesCache(preferences) {
  await runTransaction(async (db) => {
    await db.runAsync(`DELETE FROM preferences_cache`);
    for (const [key, value] of Object.entries(preferences)) {
      await db.runAsync(`INSERT INTO preferences_cache (key, value) VALUES (?, ?)`, [key, value]);
    }
  });
}

// --- today's summary (total hours + jobs worked, straight from local
// data — no backend round-trip, matches whatever actually happened on this
// device today regardless of signal) ---

export async function getTodaySummary() {
  const db = await getDb();
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayStartIso = todayStart.toISOString();

  const entries = await db.getAllAsync(
    `SELECT * FROM time_entries WHERE clock_in_at >= ? ORDER BY clock_in_at`,
    [todayStartIso]
  );

  let totalMs = 0;
  for (const entry of entries) {
    const start = new Date(entry.clock_in_at).getTime();
    const end = entry.clock_out_at ? new Date(entry.clock_out_at).getTime() : Date.now();
    totalMs += end - start;
  }

  // One row per finished-and-submitted visit today (not per job — a job
  // worked twice today would show twice), each carrying its completion's
  // client_id so the UI can navigate straight to that visit's photos/notes.
  // Pending (not-yet-submitted) visits aren't included here — those already
  // have their own "Pending Completions" list elsewhere on Home.
  const visits = await db.getAllAsync(
    `SELECT jc.client_id AS completion_client_id, jc.submitted_at,
            j.id AS job_id, j.job_number, j.name, j.address, j.customer_name
     FROM job_completions jc
     JOIN job_segments js ON js.client_id = jc.job_segment_client_id
     JOIN jobs_cache j ON j.id = js.job_id
     WHERE jc.submitted_at >= ?
     ORDER BY jc.submitted_at`,
    [todayStartIso]
  );

  return { totalHours: totalMs / 3600000, visits };
}

// Every day this device has clock data for, most recent first, with total
// hours worked that day — a personal hours history, straight from local
// time_entries (same "device is the source of truth" approach as
// getTodaySummary, just across every day instead of just today).
export async function getHoursHistory() {
  const db = await getDb();
  const entries = await db.getAllAsync(`SELECT * FROM time_entries ORDER BY clock_in_at`);

  const byDate = new Map();
  for (const entry of entries) {
    const date = entry.clock_in_at.slice(0, 10); // 'YYYY-MM-DD', local wall-clock date it was typed with
    const start = new Date(entry.clock_in_at).getTime();
    const end = entry.clock_out_at ? new Date(entry.clock_out_at).getTime() : Date.now();
    byDate.set(date, (byDate.get(date) || 0) + (end - start));
  }

  return Array.from(byDate.entries())
    .map(([date, totalMs]) => ({ date, totalHours: totalMs / 3600000 }))
    .sort((a, b) => (a.date < b.date ? 1 : -1));
}

// Dev-only: wipes local completion records (and their parts/photos) so
// today's visits list starts clean. Doesn't touch time_entries/job_segments
// (the actual clock/travel/work history stays) or anything on the backend —
// this is purely local test-data cleanup, run from the device itself.
export async function clearCompletedVisits() {
  await runTransaction(async (db) => {
    await db.runAsync(`DELETE FROM job_completion_photos`);
    await db.runAsync(`DELETE FROM job_completion_parts`);
    await db.runAsync(`DELETE FROM job_completions`);
  });
}

// --- per-account local data isolation ---
//
// Every table above is otherwise shared globally on the device, with no
// user_id column at all — it was built assuming "one tech, one phone,"
// which holds in real use but breaks the moment a second account logs in
// on the same device (a new account would just see whatever the previous
// one left behind: hours, jobs, everything). CURRENT_USER_KEY tracks which
// account's data is actually sitting in these tables; when a different
// user logs in, everything gets wiped before that account touches it.
//
// This does mean switching back to a previous account on the same device
// starts that account's local data fresh too (not restored) — the sync
// engine only ever pushes local -> server, never pulls server -> local, so
// there's nothing to re-download from. Fine for the real usage pattern
// (one tech's own phone); a real "restore from server" sync would be a
// separate feature if multi-account-per-device ever becomes a real case.
const CURRENT_USER_KEY = 'current_user_id';

// Call once per login, before any other local read/write for the session.
// Wipes local tracking data if a different account was last using this
// device; no-ops if it's the same account (or the first login ever).
export async function ensureLocalDataForUser(userId) {
  const stored = await getAppSetting(CURRENT_USER_KEY);
  if (stored !== null && Number(stored) === Number(userId)) return;

  await runTransaction(async (db) => {
    await db.runAsync(`DELETE FROM job_completion_photos`);
    await db.runAsync(`DELETE FROM job_completion_parts`);
    await db.runAsync(`DELETE FROM job_completions`);
    await db.runAsync(`DELETE FROM job_segments`);
    await db.runAsync(`DELETE FROM time_entries`);
    await db.runAsync(`DELETE FROM jobs_cache`);
    await db.runAsync(`DELETE FROM assigned_jobs_cache`);
    await db.runAsync(`DELETE FROM preferences_cache`);
    // parts_cache intentionally untouched — shared catalog data, not
    // scoped to any one account.
  });
  await setAppSetting(CURRENT_USER_KEY, String(userId));
}
