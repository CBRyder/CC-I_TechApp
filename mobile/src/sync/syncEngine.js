import { File } from 'expo-file-system';
import * as local from '../db/local';
import * as api from '../api/client';
import { ApiError } from '../api/client';

let isSyncing = false;

// Pushes whatever's queued locally (time entries, job segments, job
// completions, parts used, and completion photos, in that dependency
// order) to the backend. Safe to call often — it's a no-op while offline
// (each call just fails fast) and guards against overlapping runs.
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
  const counts = { timeEntries: 0, segments: 0, completions: 0, parts: 0, photos: 0 };

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
      counts.timeEntries++;
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
      counts.segments++;
    }

    const unsyncedCompletions = await local.getUnsyncedCompletions();
    for (const completion of unsyncedCompletions) {
      const result = await api.syncJobCompletion(
        {
          client_id: completion.client_id,
          job_segment_client_id: completion.job_segment_client_id,
          visit_summary: completion.visit_summary,
          submitted_at: completion.submitted_at,
        },
        accessToken
      );
      await local.markCompletionSynced(completion.client_id, result.id);
      counts.completions++;
    }

    const unsyncedParts = await local.getUnsyncedPartsWithSyncedParent();
    for (const part of unsyncedParts) {
      const result = await api.syncCompletionPart(
        {
          client_id: part.client_id,
          job_completion_client_id: part.job_completion_client_id,
          part_id: part.part_id,
          quantity: part.quantity,
        },
        accessToken
      );
      await local.markCompletionPartSynced(part.client_id, result.id);
      counts.parts++;
    }

    const unuploadedPhotos = await local.getUnuploadedPhotosWithSyncedParent();
    for (const photo of unuploadedPhotos) {
      const { uploadUrl } = await api.presignCompletionPhoto(
        {
          client_id: photo.client_id,
          job_completion_client_id: photo.job_completion_client_id,
          kind: photo.kind,
        },
        accessToken
      );
      await new File(photo.local_uri).upload(uploadUrl, {
        httpMethod: 'PUT',
        headers: { 'Content-Type': 'image/jpeg' },
      });
      await api.confirmCompletionPhoto({ client_id: photo.client_id }, accessToken);
      await local.markPhotoUploaded(photo.client_id);
      counts.photos++;
    }

    return counts;
  } catch (err) {
    if (err instanceof ApiError && err.status === 401 && !isRetry) {
      // Likely offline long enough for the 15-min access token to expire —
      // refresh once and retry the whole pass.
      const newToken = await refreshAccessToken();
      return runSyncPass(newToken, refreshAccessToken, true);
    }
    // Network error, server unreachable, R2 not configured yet, etc. —
    // leave whatever's left unsynced. The next trigger (reconnect, app
    // foreground) retries it; nothing already marked synced is lost.
    return { ...counts, error: err.message };
  }
}
