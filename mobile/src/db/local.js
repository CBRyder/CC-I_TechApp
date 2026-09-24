import * as SQLite from 'expo-sqlite';
import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';

const LOCAL_DB_KEY = 'local-db-key';

async function getLocalDbKey() {
  let key = await SecureStore.getItemAsync(LOCAL_DB_KEY);
  if (!key) {
    const bytes = await Crypto.getRandomBytesAsync(32);
    key = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
    await SecureStore.setItemAsync(LOCAL_DB_KEY, key, {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
  }
  return key;
}

// Every read/write in this file awaits this instead of opening the database
// directly. TrackingContext and SettingsContext both touch local data from
// their own independent mount effects — nothing sequences one before the
// other — so whichever fires first pays for opening the connection AND
// bringing the schema fully up to date (CREATE TABLE, column migrations,
// legacy backfill); every other caller, on either context, just awaits the
// same promise and gets the already-ready connection. Without this, one
// could race ahead and query a column (e.g. user_id) before the other's
// migration added it.
let dbReadyPromise = null;

function getDb() {
  if (!dbReadyPromise) {
    dbReadyPromise = setupDb();
  }
  return dbReadyPromise;
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

// Opens the connection and brings the schema fully up to date — called
// exactly once (memoized by getDb() above), by whichever caller touches
// the database first. This local DB is the real-time source of truth for
// clock/job state on this device — the backend is a durable copy it syncs
// to when there's signal, not something the UI waits on.
//
// Also exported as initDb() for TrackingContext to call explicitly first
// (clearer intent, though every function in this file would wait on the
// same setup regardless via getDb()).
async function setupDb() {
  const db = await SQLite.openDatabaseAsync('tracking.db');

  // SQLCipher is enabled for native production builds. Expo Go does not ship
  // SQLCipher, so development clients may use normal SQLite; production
  // builds fail closed rather than pretending the database is encrypted.
  if (!__DEV__) {
    if (typeof db.execAsync !== 'function') throw new Error('Encrypted SQLite is unavailable');
    const key = await getLocalDbKey();
    await db.execAsync(`PRAGMA key = '${key}'; PRAGMA cipher_memory_security = ON;`);
  }
  await db.execAsync(`
    PRAGMA journal_mode = WAL;

    CREATE TABLE IF NOT EXISTS time_entries (
      client_id TEXT PRIMARY KEY NOT NULL,
      server_id INTEGER,
      user_id INTEGER,
      clock_in_at TEXT NOT NULL,
      clock_out_at TEXT,
      synced INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS job_segments (
      client_id TEXT PRIMARY KEY NOT NULL,
      server_id INTEGER,
      user_id INTEGER,
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

    -- Always holds just the most recently fetched assigned-jobs list per
    -- account (one date at a time — Home only ever needs "today").
    CREATE TABLE IF NOT EXISTS assigned_jobs_cache (
      id INTEGER NOT NULL,
      user_id INTEGER,
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
      user_id INTEGER,
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

    -- Read-through cache of the server's user_preferences, per account, so
    -- a synced preference (like preferred categories) still applies with
    -- no signal. Writes go straight to the server (see SettingsContext) —
    -- this is only refreshed after a successful write or an explicit reload.
    CREATE TABLE IF NOT EXISTS preferences_cache (
      key TEXT NOT NULL,
      user_id INTEGER,
      value TEXT
    );
  `);

  // Existing installs from before per-account scoping: add the new
  // user_id columns (SQLite can't do this inside CREATE TABLE IF NOT
  // EXISTS once a table already exists). No-ops on a fresh install, where
  // the columns above already exist.
  await ensureColumn(db, 'time_entries', 'user_id', 'INTEGER');
  await ensureColumn(db, 'job_segments', 'user_id', 'INTEGER');
  await ensureColumn(db, 'job_completions', 'user_id', 'INTEGER');
  await ensureColumn(db, 'assigned_jobs_cache', 'user_id', 'INTEGER');
  await ensureColumn(db, 'preferences_cache', 'user_id', 'INTEGER');

  // Operates on `db` directly rather than through getDb()/runTransaction()
  // — both would deadlock here, since they await the very setup this
  // function is still in the middle of.
  await backfillLegacyRows(db);

  return db;
}

// Exported for TrackingContext to call explicitly first — see setupDb's
// comment above.
export async function initDb() {
  await getDb();
}

async function ensureColumn(db, table, column, type) {
  const columns = await db.getAllAsync(`PRAGMA table_info(${table})`);
  if (!columns.some((c) => c.name === column)) {
    await db.execAsync(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
  }
}

// One-time migration for installs that predate per-account scoping: rows
// written back then have no user_id (NULL). They can only ever belong to
// whichever account was active on this device when they were written — the
// old design wiped every table the moment a different account logged in,
// so at most one account's data ever existed here at once. That account is
// exactly what LEGACY_CURRENT_USER_KEY recorded. Backfill NULL rows to it
// once, then delete the key so this becomes a no-op forever after.
const LEGACY_CURRENT_USER_KEY = 'current_user_id';

async function backfillLegacyRows(db) {
  const legacyOwner = await db.getFirstAsync(`SELECT value FROM app_settings WHERE key = ?`, [
    LEGACY_CURRENT_USER_KEY,
  ]);
  if (!legacyOwner) return; // fresh install, or already migrated

  const ownerId = Number(legacyOwner.value);
  await db.withTransactionAsync(async () => {
    await db.runAsync(`UPDATE time_entries SET user_id = ? WHERE user_id IS NULL`, [ownerId]);
    await db.runAsync(`UPDATE job_segments SET user_id = ? WHERE user_id IS NULL`, [ownerId]);
    await db.runAsync(`UPDATE job_completions SET user_id = ? WHERE user_id IS NULL`, [ownerId]);
    await db.runAsync(`UPDATE assigned_jobs_cache SET user_id = ? WHERE user_id IS NULL`, [
      ownerId,
    ]);
    await db.runAsync(`UPDATE preferences_cache SET user_id = ? WHERE user_id IS NULL`, [
      ownerId,
    ]);
    await db.runAsync(`DELETE FROM app_settings WHERE key = ?`, [LEGACY_CURRENT_USER_KEY]);
  });
}

// --- time entries ---

export async function getOpenTimeEntry() {
  const db = await getDb();
  return db.getFirstAsync(
    `SELECT * FROM time_entries WHERE clock_out_at IS NULL AND user_id = ? ORDER BY clock_in_at DESC LIMIT 1`,
    [activeUserId]
  );
}

export async function createTimeEntry(clientId, clockInAt) {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO time_entries (client_id, user_id, clock_in_at, synced) VALUES (?, ?, ?, 0)`,
    [clientId, activeUserId, clockInAt]
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

// Only the active account's own unsynced records — another account's
// still-queued data (from before it was switched away from) stays put
// until it's active again; syncing it now would push it with the wrong
// account's access token.
export async function getUnsyncedTimeEntries() {
  const db = await getDb();
  return db.getAllAsync(`SELECT * FROM time_entries WHERE synced = 0 AND user_id = ?`, [
    activeUserId,
  ]);
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
    `INSERT INTO job_segments (client_id, user_id, time_entry_client_id, job_id, state, started_at, synced)
     VALUES (?, ?, ?, ?, ?, ?, 0)`,
    [clientId, activeUserId, timeEntryClientId, jobId, state, startedAt]
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
// themselves (the backend needs the parent to exist first) — and only the
// active account's own, for the same reason as getUnsyncedTimeEntries.
export async function getUnsyncedSegmentsWithSyncedParent() {
  const db = await getDb();
  return db.getAllAsync(
    `SELECT js.* FROM job_segments js
     JOIN time_entries te ON te.client_id = js.time_entry_client_id
     WHERE js.synced = 0 AND te.synced = 1 AND js.user_id = ?`,
    [activeUserId]
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

// --- assigned jobs cache ("today's jobs" for Home — one date at a time,
// per account) ---

export async function replaceAssignedJobsCache(jobs) {
  await runTransaction(async (db) => {
    await db.runAsync(`DELETE FROM assigned_jobs_cache WHERE user_id = ?`, [activeUserId]);
    for (const job of jobs) {
      await db.runAsync(
        `INSERT INTO assigned_jobs_cache (id, user_id, job_number, name, address, customer_name, status)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          job.id,
          activeUserId,
          job.job_number,
          job.name,
          job.address ?? null,
          job.customer_name ?? null,
          job.status,
        ]
      );
    }
  });
}

export async function getCachedAssignedJobs() {
  const db = await getDb();
  return db.getAllAsync(`SELECT * FROM assigned_jobs_cache WHERE user_id = ? ORDER BY job_number`, [
    activeUserId,
  ]);
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
    `INSERT INTO job_completions (client_id, user_id, job_segment_client_id, synced) VALUES (?, ?, ?, 0)`,
    [clientId, activeUserId, jobSegmentClientId]
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
     WHERE jc.submitted_at IS NULL AND jc.user_id = ?
     ORDER BY js.started_at DESC`,
    [activeUserId]
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
  return db.getAllAsync(`SELECT * FROM job_completions WHERE synced = 0 AND user_id = ?`, [
    activeUserId,
  ]);
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

// Only parts whose parent completion is already synced (and belongs to the
// active account) can sync themselves.
export async function getUnsyncedPartsWithSyncedParent() {
  const db = await getDb();
  return db.getAllAsync(
    `SELECT jcp.* FROM job_completion_parts jcp
     JOIN job_completions jc ON jc.client_id = jcp.job_completion_client_id
     WHERE jcp.synced = 0 AND jc.synced = 1 AND jc.user_id = ?`,
    [activeUserId]
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

// Only photos whose parent completion is already synced (and belongs to
// the active account) can upload.
export async function getUnuploadedPhotosWithSyncedParent() {
  const db = await getDb();
  return db.getAllAsync(
    `SELECT jcp.* FROM job_completion_photos jcp
     JOIN job_completions jc ON jc.client_id = jcp.job_completion_client_id
     WHERE jcp.uploaded = 0 AND jc.synced = 1 AND jc.user_id = ?`,
    [activeUserId]
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

// --- synced preferences cache (read-through; writes go to the server),
// per account ---

export async function getCachedPreference(key) {
  const db = await getDb();
  const row = await db.getFirstAsync(
    `SELECT value FROM preferences_cache WHERE key = ? AND user_id = ?`,
    [key, activeUserId]
  );
  return row?.value ?? null;
}

export async function getAllCachedPreferences() {
  const db = await getDb();
  const rows = await db.getAllAsync(`SELECT key, value FROM preferences_cache WHERE user_id = ?`, [
    activeUserId,
  ]);
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

export async function setCachedPreference(key, value) {
  const db = await getDb();
  const existing = await db.getFirstAsync(
    `SELECT 1 FROM preferences_cache WHERE key = ? AND user_id = ?`,
    [key, activeUserId]
  );
  if (existing) {
    await db.runAsync(`UPDATE preferences_cache SET value = ? WHERE key = ? AND user_id = ?`, [
      value,
      key,
      activeUserId,
    ]);
  } else {
    await db.runAsync(`INSERT INTO preferences_cache (key, user_id, value) VALUES (?, ?, ?)`, [
      key,
      activeUserId,
      value,
    ]);
  }
}

export async function replacePreferencesCache(preferences) {
  await runTransaction(async (db) => {
    await db.runAsync(`DELETE FROM preferences_cache WHERE user_id = ?`, [activeUserId]);
    for (const [key, value] of Object.entries(preferences)) {
      await db.runAsync(`INSERT INTO preferences_cache (key, user_id, value) VALUES (?, ?, ?)`, [
        key,
        activeUserId,
        value,
      ]);
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
    `SELECT * FROM time_entries WHERE clock_in_at >= ? AND user_id = ? ORDER BY clock_in_at`,
    [todayStartIso, activeUserId]
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
     WHERE jc.submitted_at >= ? AND jc.user_id = ?
     ORDER BY jc.submitted_at`,
    [todayStartIso, activeUserId]
  );

  return { totalHours: totalMs / 3600000, visits };
}

// Dev-only: wipes the active account's local completion records (and their
// parts/photos) so today's visits list starts clean. Doesn't touch
// time_entries/job_segments (the actual clock/travel/work history stays),
// other accounts' data, or anything on the backend — purely local test-data
// cleanup for whoever's currently logged in, run from the device itself.
export async function clearCompletedVisits() {
  await runTransaction(async (db) => {
    await db.runAsync(
      `DELETE FROM job_completion_photos WHERE job_completion_client_id IN
       (SELECT client_id FROM job_completions WHERE user_id = ?)`,
      [activeUserId]
    );
    await db.runAsync(
      `DELETE FROM job_completion_parts WHERE job_completion_client_id IN
       (SELECT client_id FROM job_completions WHERE user_id = ?)`,
      [activeUserId]
    );
    await db.runAsync(`DELETE FROM job_completions WHERE user_id = ?`, [activeUserId]);
  });
}

// --- per-account local data isolation ---
//
// time_entries, job_segments, job_completions (+ their parts/photos),
// assigned_jobs_cache, and preferences_cache all carry a user_id column
// (see initDb) and every read/write above filters or stamps it using
// activeUserId. jobs_cache and parts_cache stay unscoped/global — shared
// catalog data, not personal state, same on every account.
//
// This means switching accounts on the same device no longer wipes
// anything: each account just sees its own slice of these tables. Clock
// in as account A, switch to account B (B starts clean — no entry, no
// running time), switch back to A and its open time entry/segment/pending
// completions are exactly where it left them, still running if it was.
let activeUserId = null;

// Call once per login and again on every account switch, before any other
// local read/write for the session — every scoped query above reads this.
export async function setActiveUser(userId) {
  activeUserId = userId;
}
