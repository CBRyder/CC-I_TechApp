import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import * as SecureStore from 'expo-secure-store';
import * as api from '../api/client';

// Every account ever logged into on this device is remembered here (its own
// refresh token, alongside the others) so switching between them is instant
// — no re-entering a password. ACTIVE_USER_KEY says which one is currently
// driving the app. logout() only clears the "active" pointer, not the
// account's entry in ACCOUNTS_KEY — it stays one tap away via
// switchAccount(). removeAccount() is the only thing that actually forgets
// one.
const ACCOUNTS_KEY = 'accounts';
const ACTIVE_USER_KEY = 'activeUserId';

async function getAccounts() {
  const raw = await SecureStore.getItemAsync(ACCOUNTS_KEY);
  return raw ? JSON.parse(raw) : [];
}

async function saveAccounts(accounts) {
  await SecureStore.setItemAsync(ACCOUNTS_KEY, JSON.stringify(accounts));
}

async function upsertAccount(account) {
  const accounts = await getAccounts();
  const idx = accounts.findIndex((a) => a.id === account.id);
  if (idx >= 0) accounts[idx] = account;
  else accounts.push(account);
  await saveAccounts(accounts);
}

// Strips refresh tokens before handing the list to component state — the
// switcher UI only needs id/username/full_name to render, and there's no
// reason for raw tokens to sit in React state when SecureStore already has
// them.
function stripTokens(accounts) {
  return accounts.map(({ id, username, email, full_name }) => ({ id, username, email, full_name }));
}

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [accessToken, setAccessToken] = useState(null);
  const [accounts, setAccounts] = useState([]);
  const [isLoading, setIsLoading] = useState(true); // true while we try auto sign-in
  const [error, setError] = useState(null);

  // Auto sign-in: load the remembered-accounts list (for the switcher, even
  // before anything else resolves), then try the active one's refresh token.
  useEffect(() => {
    (async () => {
      try {
        const storedAccounts = await getAccounts();
        setAccounts(stripTokens(storedAccounts));

        const activeUserId = await SecureStore.getItemAsync(ACTIVE_USER_KEY);
        if (!activeUserId) return;

        const account = storedAccounts.find((a) => String(a.id) === activeUserId);
        if (!account) return;

        const { accessToken: newAccessToken } = await api.refresh(account.refreshToken);
        const me = await api.getMe(newAccessToken);

        setAccessToken(newAccessToken);
        setUser(me);
      } catch {
        // Active account's refresh token missing/expired/invalid — fall
        // through to logged-out state. Other remembered accounts (if any)
        // are untouched; only the active pointer clears.
        await SecureStore.deleteItemAsync(ACTIVE_USER_KEY);
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  const login = useCallback(async (identifier, password) => {
    setError(null);
    try {
      const { accessToken: newAccessToken, refreshToken, user: loggedInUser } = await api.login({
        identifier,
        password,
      });
      await upsertAccount({
        id: loggedInUser.id,
        username: loggedInUser.username,
        email: loggedInUser.email,
        full_name: loggedInUser.full_name,
        refreshToken,
      });
      await SecureStore.setItemAsync(ACTIVE_USER_KEY, String(loggedInUser.id));
      setAccounts(stripTokens(await getAccounts()));
      setAccessToken(newAccessToken);
      setUser(loggedInUser);
      return true;
    } catch (err) {
      setError(err.message);
      return false;
    }
  }, []);

  // Backend register() only creates the account (no tokens), so chain a login
  // to start the session right after. Logs in with username, not email —
  // email is optional now, username always is.
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

  // Signs out of the current session only — the account stays remembered
  // (its refresh token untouched in ACCOUNTS_KEY), so it's still one tap
  // away via switchAccount later, no password needed. Use removeAccount to
  // actually forget one.
  const logout = useCallback(async () => {
    await SecureStore.deleteItemAsync(ACTIVE_USER_KEY);
    setAccessToken(null);
    setUser(null);
  }, []);

  // Instantly switches to a different remembered account using its stored
  // refresh token — no password. TrackingContext reacts to `user` changing
  // and handles isolating that account's local data on its own.
  const switchAccount = useCallback(async (userId) => {
    const storedAccounts = await getAccounts();
    const account = storedAccounts.find((a) => a.id === userId);
    if (!account) throw new Error('That account is no longer remembered on this device');

    const { accessToken: newAccessToken } = await api.refresh(account.refreshToken);
    const me = await api.getMe(newAccessToken);
    await SecureStore.setItemAsync(ACTIVE_USER_KEY, String(userId));
    setAccessToken(newAccessToken);
    setUser(me);
    return me;
  }, []);

  // Actually forgets a remembered account (unlike logout). If it was the
  // active one, also signs out of it.
  const removeAccount = useCallback(
    async (userId) => {
      const storedAccounts = await getAccounts();
      const remaining = storedAccounts.filter((a) => a.id !== userId);
      await saveAccounts(remaining);
      setAccounts(stripTokens(remaining));

      const activeUserId = await SecureStore.getItemAsync(ACTIVE_USER_KEY);
      if (activeUserId && Number(activeUserId) === userId) {
        await logout();
      }
    },
    [logout]
  );

  // For callers (like the offline sync engine) that need a fresh access
  // token on demand — e.g. after being offline long enough for the 15-minute
  // access token to expire before signal came back. Re-reads the active
  // account's refresh token rather than keeping it in JS state.
  const refreshAccessToken = useCallback(async () => {
    const activeUserId = await SecureStore.getItemAsync(ACTIVE_USER_KEY);
    const storedAccounts = await getAccounts();
    const account = storedAccounts.find((a) => String(a.id) === activeUserId);
    if (!account) throw new Error('No refresh token available');

    try {
      const { accessToken: newAccessToken } = await api.refresh(account.refreshToken);
      setAccessToken(newAccessToken);
      return newAccessToken;
    } catch (err) {
      // Refresh token itself is invalid/expired (e.g. >30 days offline) —
      // nothing to do but sign out of it; local unsynced data is untouched
      // and will sync once someone's logged back in.
      await logout();
      throw err;
    }
  }, [logout]);

  // Re-fetches the current user — call after a profile update so things
  // like the Home screen greeting reflect it immediately.
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
