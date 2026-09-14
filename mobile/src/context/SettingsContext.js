import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import * as local from '../db/local';
import * as api from '../api/client';
import { useAuth } from './AuthContext';
import { scheduleClockInReminder, cancelClockInReminder } from '../utils/notifications';

const SettingsContext = createContext(null);

const DEFAULT_CLOCK_IN_HOUR = 7;
const DEFAULT_CLOCK_IN_MINUTE = 0;
const DEFAULT_CLOCK_IN_REMINDER = { enabled: false, hour: DEFAULT_CLOCK_IN_HOUR, minute: DEFAULT_CLOCK_IN_MINUTE };

// Theme is device-only (never synced — meaningless to carry to another
// phone). Everything else here is a synced user preference: cached locally
// for offline reads, but writes require a connection (account/preference
// changes aren't the kind of thing that should silently queue for later —
// unlike clock/job data, there's no urgency and getting it wrong offline
// is a worse failure mode than just asking the tech to try again online).
export function SettingsProvider({ children }) {
  const { accessToken, isAuthenticated, refreshUser } = useAuth();
  const [isReady, setIsReady] = useState(false);
  const [theme, setThemeState] = useState('system');
  const [preferredCategories, setPreferredCategoriesState] = useState([]);
  const [clockInReminder, setClockInReminderState] = useState(DEFAULT_CLOCK_IN_REMINDER);
  const [pendingReminderEnabled, setPendingReminderEnabledState] = useState(false);

  const applyPreferences = (prefs) => {
    if (prefs.preferred_categories) {
      try {
        setPreferredCategoriesState(JSON.parse(prefs.preferred_categories));
      } catch {
        setPreferredCategoriesState([]);
      }
    }
    if (prefs.clock_in_reminder) {
      try {
        setClockInReminderState(JSON.parse(prefs.clock_in_reminder));
      } catch {
        // ignore malformed cached value
      }
    }
    if (prefs.pending_completion_reminder !== undefined) {
      setPendingReminderEnabledState(prefs.pending_completion_reminder === 'true');
    }
  };

  useEffect(() => {
    (async () => {
      const storedTheme = await local.getAppSetting('theme');
      if (storedTheme) setThemeState(storedTheme);
      applyPreferences(await local.getAllCachedPreferences());
      setIsReady(true);
    })();
  }, []);

  const refreshFromServer = useCallback(async () => {
    if (!accessToken) return;
    try {
      const prefs = await api.getPreferences(accessToken);
      await local.replacePreferencesCache(prefs);
      applyPreferences(prefs);
    } catch {
      // Offline — keep using whatever's already cached.
    }
  }, [accessToken]);

  useEffect(() => {
    if (isReady && isAuthenticated) refreshFromServer();
  }, [isReady, isAuthenticated, refreshFromServer]);

  // Keep the actual OS-level reminder in sync with the current setting,
  // whenever it changes (including right after the cache/server load).
  useEffect(() => {
    if (!isReady) return;
    if (clockInReminder.enabled) {
      scheduleClockInReminder(clockInReminder.hour, clockInReminder.minute);
    } else {
      cancelClockInReminder();
    }
  }, [isReady, clockInReminder]);

  const setTheme = useCallback(async (value) => {
    setThemeState(value);
    await local.setAppSetting('theme', value);
  }, []);

  const requireOnline = () => {
    if (!accessToken) throw new Error('You need a connection to save this.');
  };

  const setPreferredCategories = useCallback(
    async (categories) => {
      requireOnline();
      const value = JSON.stringify(categories);
      await api.setPreference('preferred_categories', value, accessToken);
      await local.setCachedPreference('preferred_categories', value);
      setPreferredCategoriesState(categories);
    },
    [accessToken]
  );

  const setClockInReminder = useCallback(
    async (enabled, hour = DEFAULT_CLOCK_IN_HOUR, minute = DEFAULT_CLOCK_IN_MINUTE) => {
      requireOnline();
      const value = JSON.stringify({ enabled, hour, minute });
      await api.setPreference('clock_in_reminder', value, accessToken);
      await local.setCachedPreference('clock_in_reminder', value);
      setClockInReminderState({ enabled, hour, minute });
    },
    [accessToken]
  );

  const setPendingReminderEnabled = useCallback(
    async (enabled) => {
      requireOnline();
      const value = String(enabled);
      await api.setPreference('pending_completion_reminder', value, accessToken);
      await local.setCachedPreference('pending_completion_reminder', value);
      setPendingReminderEnabledState(enabled);
    },
    [accessToken]
  );

  const updateProfile = useCallback(
    async (fields) => {
      requireOnline();
      const result = await api.updateProfile(fields, accessToken);
      await refreshUser();
      return result;
    },
    [accessToken, refreshUser]
  );

  const changePassword = useCallback(
    async (currentPassword, newPassword) => {
      requireOnline();
      return api.changePassword(
        { current_password: currentPassword, new_password: newPassword },
        accessToken
      );
    },
    [accessToken]
  );

  const value = {
    isReady,
    theme,
    setTheme,
    preferredCategories,
    setPreferredCategories,
    clockInReminder,
    setClockInReminder,
    pendingReminderEnabled,
    setPendingReminderEnabled,
    updateProfile,
    changePassword,
  };

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings must be used within a SettingsProvider');
  return ctx;
}
