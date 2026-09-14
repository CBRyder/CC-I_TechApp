import * as local from '../db/local';
import * as api from '../api/client';
import { ApiError } from '../api/client';

let isSyncing = false;

// Pushes whatever's queued locally (unsynced time entries, then unsynced job
// segments whose parent entry is already synced) to the backend. Safe to
// call often — it's a no-op while offline (each call just fails fast) and
// guards against overlapping runs.
export async function syncPendingRecords({ accessToken, refreshAccessToken }) {
  if (isSyncing || !accessToken) return { skipped: true };
  isSyncing = true;
  try {
    return await runSyncPass(accessToken, refreshAccessToken, false);
  } finally {
    isSyncing = false;
  }
}

async function runSyncPass(accessToken, refreshAccessToken, isRetry) {
  let syncedTimeEntries = 0;
  let syncedSegments = 0;

  try {
    const unsyncedEntries = await local.getUnsyncedTimeEntries();
    for (const entry of unsyncedEntries) {
      const result = await api.syncTimeEntry(
        {
          client_id: entry.client_id,
          clock_in_at: entry.clock_in_at,
          clock_out_at: entry.clock_out_at,
        },
        accessToken
      );
      await local.markTimeEntrySynced(entry.client_id, result.id);
      syncedTimeEntries++;
    }

    const unsyncedSegments = await local.getUnsyncedSegmentsWithSyncedParent();
    for (const segment of unsyncedSegments) {
      const result = await api.syncJobSegment(
        {
          client_id: segment.client_id,
          time_entry_client_id: segment.time_entry_client_id,
          job_id: segment.job_id,
          state: segment.state,
          started_at: segment.started_at,
          ended_at: segment.ended_at,
        },
        accessToken
      );
      await local.markSegmentSynced(segment.client_id, result.id);
      syncedSegments++;
    }

    return { syncedTimeEntries, syncedSegments };
  } catch (err) {
    if (err instanceof ApiError && err.status === 401 && !isRetry) {
      // Likely offline long enough for the 15-min access token to expire —
      // refresh once and retry the whole pass.
      const newToken = await refreshAccessToken();
      return runSyncPass(newToken, refreshAccessToken, true);
    }
    // Network error / server unreachable / etc — leave whatever's left
    // unsynced. The next trigger (reconnect, app foreground) retries it.
    return { syncedTimeEntries, syncedSegments, error: err.message };
  }
}
