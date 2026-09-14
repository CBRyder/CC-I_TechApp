import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { AppState } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import * as local from '../db/local';
import * as api from '../api/client';
import { uuidv4 } from '../utils/uuid';
import { useAuth } from './AuthContext';
import { syncPendingRecords } from '../sync/syncEngine';

const TrackingContext = createContext(null);

// The device's own local date (not UTC) — 'YYYY-MM-DD', matching what the
// backend's /jobs/assigned expects.
function todayLocalDate() {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60000;
  return new Date(now - offset).toISOString().slice(0, 10);
}

// The local SQLite DB (src/db/local.js) is the real-time source of truth
// for clock/job state on this device — every action below writes there
// first and updates the UI immediately, working fully offline. Syncing to
// the backend happens in the background (see src/sync/syncEngine.js) and
// never blocks an action.
export function TrackingProvider({ children }) {
  const { accessToken, refreshAccessToken, isAuthenticated } = useAuth();
  const [isReady, setIsReady] = useState(false);
  const [timeEntry, setTimeEntry] = useState(null);
  const [activeSegment, setActiveSegment] = useState(null);
  const [jobs, setJobs] = useState([]);
  const [assignedJobs, setAssignedJobs] = useState([]);
  const [parts, setParts] = useState([]);

  const refreshLocalState = useCallback(async () => {
    const entry = await local.getOpenTimeEntry();
    setTimeEntry(entry ?? null);

    if (entry) {
      const segment = await local.getActiveSegment(entry.client_id);
      setActiveSegment(segment ?? null);
    } else {
      setActiveSegment(null);
    }

    setJobs(await local.getCachedJobs());
    setAssignedJobs(await local.getCachedAssignedJobs());
    setParts(await local.getCachedParts());
  }, []);

  const triggerSync = useCallback(async () => {
    if (!accessToken) return;
    await syncPendingRecords({ accessToken, refreshAccessToken });
  }, [accessToken, refreshAccessToken]);

  const refreshJobsFromServer = useCallback(async () => {
    if (!accessToken) return;
    try {
      const serverJobs = await api.listJobs(accessToken);
      await local.replaceJobsCache(serverJobs);
      setJobs(await local.getCachedJobs());
    } catch {
      // Offline or request failed — keep using whatever's already cached.
    }
  }, [accessToken]);

  // "Today's jobs" for Home — the device's own local date, not the
  // server's. Call with a different date later if you add a day picker.
  const refreshAssignedJobsFromServer = useCallback(
    async (date = todayLocalDate()) => {
      if (!accessToken) return;
      try {
        const serverJobs = await api.getAssignedJobs(date, accessToken);
        await local.replaceAssignedJobsCache(serverJobs);
        setAssignedJobs(await local.getCachedAssignedJobs());
      } catch {
        // Offline or request failed — keep using whatever's already cached.
      }
    },
    [accessToken]
  );

  const refreshPartsFromServer = useCallback(async () => {
    if (!accessToken) return;
    try {
      const serverParts = await api.listParts(accessToken);
      await local.replacePartsCache(serverParts);
      setParts(await local.getCachedParts());
    } catch {
      // Offline or request failed — keep using whatever's already cached.
    }
  }, [accessToken]);

  // One-time setup: create the local schema and load whatever state is
  // already on-device (works even if we never reach the network).
  useEffect(() => {
    (async () => {
      await local.initDb();
      await refreshLocalState();
      setIsReady(true);
    })();
  }, [refreshLocalState]);

  // Once logged in: pull fresh jobs/parts lists if we can, and flush
  // anything queued locally from a previous offline session.
  useEffect(() => {
    if (!isReady || !isAuthenticated) return;
    refreshJobsFromServer();
    refreshAssignedJobsFromServer();
    refreshPartsFromServer();
    triggerSync();
  }, [
    isReady,
    isAuthenticated,
    refreshJobsFromServer,
    refreshAssignedJobsFromServer,
    refreshPartsFromServer,
    triggerSync,
  ]);

  // Sync triggers: connectivity restored, or app brought back to the
  // foreground. (Expo Go can't run true background sync — this is the
  // reliable substitute: sync whenever the app is actually open and online.)
  useEffect(() => {
    if (!isAuthenticated) return;

    const unsubscribeNetInfo = NetInfo.addEventListener((state) => {
      if (state.isConnected && state.isInternetReachable !== false) {
        triggerSync();
      }
    });
    const appStateSubscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') triggerSync();
    });

    return () => {
      unsubscribeNetInfo();
      appStateSubscription.remove();
    };
  }, [isAuthenticated, triggerSync]);

  const clockIn = useCallback(async () => {
    if (timeEntry) return false; // already clocked in
    const clientId = uuidv4();
    await local.createTimeEntry(clientId, new Date().toISOString());
    await refreshLocalState();
    triggerSync();
    return true;
  }, [timeEntry, refreshLocalState, triggerSync]);

  const clockOut = useCallback(async () => {
    if (!timeEntry) return false;
    const now = new Date().toISOString();
    // Auto-finish any active job segment, mirroring the backend's clock-out
    // behavior, so forgetting to explicitly finish a job doesn't block this.
    // Also queues a completion for it, same as an explicit Finish — clocking
    // out mid-job shouldn't silently skip the photos/summary/parts prompt.
    if (activeSegment) {
      await local.endSegment(activeSegment.client_id, now);
      const completionClientId = uuidv4();
      await local.createJobCompletion(completionClientId, activeSegment.client_id);
    }
    await local.setTimeEntryClockOut(timeEntry.client_id, now);
    await refreshLocalState();
    triggerSync();
    return true;
  }, [timeEntry, activeSegment, refreshLocalState, triggerSync]);

  const selectJob = useCallback(
    async (jobId, state = 'travel') => {
      if (!timeEntry) return false; // must clock in first
      if (activeSegment) return false; // finish the current job first
      const clientId = uuidv4();
      await local.createSegment(clientId, timeEntry.client_id, jobId, state, new Date().toISOString());
      await refreshLocalState();
      triggerSync();
      return true;
    },
    [timeEntry, activeSegment, refreshLocalState, triggerSync]
  );

  const transitionState = useCallback(
    async (state) => {
      if (!activeSegment) return false;
      const now = new Date().toISOString();
      await local.endSegment(activeSegment.client_id, now);
      const clientId = uuidv4();
      await local.createSegment(
        clientId,
        activeSegment.time_entry_client_id,
        activeSegment.job_id,
        state,
        now
      );
      await refreshLocalState();
      triggerSync();
      return true;
    },
    [activeSegment, refreshLocalState, triggerSync]
  );

  // Finish is a time marker first (ends the segment right now, same as
  // before) — that part never waits on anything. It also queues the job
  // for completion: a separate local record for before/after photos, a
  // visit summary, and parts used, which the tech fills in and submits
  // whenever they get to it, synced independently once it exists.
  const finishJob = useCallback(async () => {
    if (!activeSegment) return null;
    const now = new Date().toISOString();
    await local.endSegment(activeSegment.client_id, now);

    const completionClientId = uuidv4();
    await local.createJobCompletion(completionClientId, activeSegment.client_id);

    await refreshLocalState();
    triggerSync();
    return completionClientId;
  }, [activeSegment, refreshLocalState, triggerSync]);

  // --- job completion details (photos / summary / parts used) ---

  const addPartToCompletion = useCallback(
    async (completionClientId, partId, quantity = 1) => {
      const clientId = uuidv4();
      await local.addCompletionPart(clientId, completionClientId, partId, quantity);
      triggerSync();
      return clientId;
    },
    [triggerSync]
  );

  const removePartFromCompletion = useCallback(async (partClientId) => {
    await local.removeCompletionPart(partClientId);
  }, []);

  const addPhotoToCompletion = useCallback(
    async (completionClientId, kind, localUri) => {
      const clientId = uuidv4();
      await local.addCompletionPhoto(clientId, completionClientId, kind, localUri);
      triggerSync();
      return clientId;
    },
    [triggerSync]
  );

  const setCompletionSummary = useCallback(async (completionClientId, summary) => {
    await local.updateCompletionSummary(completionClientId, summary);
  }, []);

  const submitCompletion = useCallback(
    async (completionClientId) => {
      await local.markCompletionSubmitted(completionClientId, new Date().toISOString());
      triggerSync();
    },
    [triggerSync]
  );

  const value = {
    isReady,
    timeEntry,
    activeSegment,
    jobs,
    assignedJobs,
    parts,
    isClockedIn: !!timeEntry,
    clockIn,
    clockOut,
    selectJob,
    transitionState,
    finishJob,
    refreshJobsFromServer,
    refreshAssignedJobsFromServer,
    refreshPartsFromServer,
    syncNow: triggerSync,
    // completion details — reads pass straight through to the local DB,
    // writes go through the wrappers above so they trigger a sync
    getPendingCompletions: local.getPendingCompletions,
    getJobCompletion: local.getJobCompletion,
    getCompletionParts: local.getCompletionParts,
    getCompletionPhotos: local.getCompletionPhotos,
    addPartToCompletion,
    removePartFromCompletion,
    addPhotoToCompletion,
    setCompletionSummary,
    submitCompletion,
  };

  return <TrackingContext.Provider value={value}>{children}</TrackingContext.Provider>;
}

export function useTracking() {
  const ctx = useContext(TrackingContext);
  if (!ctx) throw new Error('useTracking must be used within a TrackingProvider');
  return ctx;
}
