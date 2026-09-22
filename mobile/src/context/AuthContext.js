import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import * as SecureStore from 'expo-secure-store';
import * as api from '../api/client';
import { uuidv4 } from '../utils/uuid';

const ACCOUNTS_KEY = 'accounts';
const ACTIVE_USER_KEY = 'activeUserId';
const DEVICE_ID_KEY = 'deviceId';

// Refresh-token rotation invalidates the old token immediately. Prevent
// concurrent app effects from racing the same refresh token and triggering
// the server's reuse-detection response.
const refreshFlights = new Map();

async function getAccounts() {
  const raw = await SecureStore.getItemAsync(ACCOUNTS_KEY);
  return raw ? JSON.parse(raw) : [];
}

async function saveAccounts(accounts) {
  await SecureStore.setItemAsync(ACCOUNTS_KEY, JSON.stringify(accounts));
}

async function getDeviceId() {
  let deviceId = await SecureStore.getItemAsync(DEVICE_ID_KEY);
  if (!deviceId) {
    deviceId = uuidv4();
    await SecureStore.setItemAsync(DEVICE_ID_KEY, deviceId);
  }
  return deviceId;
}

async function rotateRefreshToken(accountId, refreshToken, deviceId) {
  const key = String(accountId);
  const existing = refreshFlights.get(key);
  if (existing) return existing;

  const promise = api.refresh(refreshToken, deviceId).finally(() => {
    refreshFlights.delete(key);
  });
  refreshFlights.set(key, promise);
  return promise;
}

async function upsertAccount(account) {
  const accounts = await getAccounts();
  const idx = accounts.findIndex((a) => a.id === account.id);
  if (idx >= 0) accounts[idx] = { ...accounts[idx], ...account };
  else accounts.push(account);
  await saveAccounts(accounts);
}

function stripTokens(accounts) {
  return accounts.map(({ id, username, email, full_name }) => ({
    id,
    username,
    email,
    full_name,
  }));
}

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [accessToken, setAccessToken] = useState(null);
  const [accounts, setAccounts] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const storedAccounts = await getAccounts();
        setAccounts(stripTokens(storedAccounts));

        const activeUserId = await SecureStore.getItemAsync(ACTIVE_USER_KEY);
        if (!activeUserId) return;

        const account = storedAccounts.find((a) => String(a.id) === activeUserId);
        if (!account?.refreshToken) return;

        const deviceId = await getDeviceId();
        const refreshed = await rotateRefreshToken(account.id, account.refreshToken, deviceId);

        await upsertAccount({
          ...account,
          refreshToken: refreshed.refreshToken,
        });

        const me = await api.getMe(refreshed.accessToken);

        setAccounts(stripTokens(await getAccounts()));
        setAccessToken(refreshed.accessToken);
        setUser(me);
      } catch {
        await SecureStore.deleteItemAsync(ACTIVE_USER_KEY);
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  const login = useCallback(async (identifier, password) => {
    setError(null);
    try {
      const deviceId = await getDeviceId();
      const result = await api.login({ identifier, password, deviceId });

      await upsertAccount({
        id: result.user.id,
        username: result.user.username,
        email: result.user.email,
        full_name: result.user.full_name,
        refreshToken: result.refreshToken,
      });

      await SecureStore.setItemAsync(ACTIVE_USER_KEY, String(result.user.id));
      setAccounts(stripTokens(await getAccounts()));
      setAccessToken(result.accessToken);
      setUser(result.user);
      return true;
    } catch (err) {
      setError(err.message);
      return false;
    }
  }, []);

  const register = useCallback(
    async ({ full_name, username, email, phone, password }) => {
      setError(null);
      try {
        await api.register({ full_name, username, email, phone, password });
        return login(username, password);
      } catch (err) {
        setError(err.message);
        return false;
      }
    },
    [login]
  );

  const logout = useCallback(async () => {
    const activeUserId = await SecureStore.getItemAsync(ACTIVE_USER_KEY);
    const storedAccounts = await getAccounts();
    const account = storedAccounts.find((a) => String(a.id) === activeUserId);

    // Best-effort server-side revocation. Local state is cleared even when
    // the device is offline; the server token will expire or can be revoked
    // later by device/session administration.
    if (account?.refreshToken) {
      try {
        await api.logout(account.refreshToken, await getDeviceId());
      } catch {}
      await upsertAccount({ ...account, refreshToken: null });
    }

    await SecureStore.deleteItemAsync(ACTIVE_USER_KEY);
    setAccounts(stripTokens(await getAccounts()));
    setAccessToken(null);
    setUser(null);
  }, []);

  const switchAccount = useCallback(async (userId) => {
    const storedAccounts = await getAccounts();
    const account = storedAccounts.find((a) => a.id === userId);
    if (!account) throw new Error('That account is no longer remembered on this device');
    if (!account.refreshToken) throw new Error('Please sign in to this account again');

    const deviceId = await getDeviceId();
    const refreshed = await rotateRefreshToken(account.id, account.refreshToken, deviceId);

    await upsertAccount({
      ...account,
      refreshToken: refreshed.refreshToken,
    });

    const me = await api.getMe(refreshed.accessToken);
    await SecureStore.setItemAsync(ACTIVE_USER_KEY, String(userId));
    setAccounts(stripTokens(await getAccounts()));
    setAccessToken(refreshed.accessToken);
    setUser(me);
    return me;
  }, []);

  const removeAccount = useCallback(
    async (userId) => {
      const storedAccounts = await getAccounts();
      const account = storedAccounts.find((a) => a.id === userId);

      if (account?.refreshToken) {
        try {
          await api.logout(account.refreshToken);
        } catch {}
      }

      const remaining = storedAccounts.filter((a) => a.id !== userId);
      await saveAccounts(remaining);
      setAccounts(stripTokens(remaining));

      const activeUserId = await SecureStore.getItemAsync(ACTIVE_USER_KEY);
      if (activeUserId && Number(activeUserId) === userId) {
        await SecureStore.deleteItemAsync(ACTIVE_USER_KEY);
        setAccessToken(null);
        setUser(null);
      }
    },
    []
  );

  const refreshAccessToken = useCallback(async () => {
    const activeUserId = await SecureStore.getItemAsync(ACTIVE_USER_KEY);
    const storedAccounts = await getAccounts();
    const account = storedAccounts.find((a) => String(a.id) === activeUserId);
    if (!account?.refreshToken) throw new Error('No refresh token available');

    try {
      const deviceId = await getDeviceId();
      const refreshed = await rotateRefreshToken(account.id, account.refreshToken, deviceId);

      await upsertAccount({
        ...account,
        refreshToken: refreshed.refreshToken,
      });

      setAccessToken(refreshed.accessToken);
      return refreshed.accessToken;
    } catch (err) {
      await logout();
      throw err;
    }
  }, [logout]);

  const refreshUser = useCallback(async () => {
    if (!accessToken) return;
    const me = await api.getMe(accessToken);
    setUser(me);
  }, [accessToken]);

  const value = {
    user,
    accessToken,
    accounts,
    isAuthenticated: !!user,
    isLoading,
    error,
    login,
    register,
    logout,
    switchAccount,
    removeAccount,
    refreshAccessToken,
    refreshUser,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
