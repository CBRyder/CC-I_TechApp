import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import * as SecureStore from 'expo-secure-store';
import * as api from '../api/client';

const REFRESH_TOKEN_KEY = 'refreshToken';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [accessToken, setAccessToken] = useState(null);
  const [isLoading, setIsLoading] = useState(true); // true while we try auto sign-in
  const [error, setError] = useState(null);

  // Auto sign-in: on launch, try to trade a stored refresh token for a new
  // access token and load the current user.
  useEffect(() => {
    (async () => {
      try {
        const storedRefreshToken = await SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
        if (!storedRefreshToken) return;

        const { accessToken: newAccessToken } = await api.refresh(storedRefreshToken);
        const me = await api.getMe(newAccessToken);

        setAccessToken(newAccessToken);
        setUser(me);
      } catch {
        // Stored refresh token missing/expired/invalid — fall through to logged-out state.
        await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  const login = useCallback(async (email, password) => {
    setError(null);
    try {
      const { accessToken: newAccessToken, refreshToken, user: loggedInUser } = await api.login({
        email,
        password,
      });
      await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, refreshToken);
      setAccessToken(newAccessToken);
      setUser(loggedInUser);
      return true;
    } catch (err) {
      setError(err.message);
      return false;
    }
  }, []);

  // Backend register() only creates the account (no tokens), so chain a login
  // to start the session right after.
  const register = useCallback(
    async ({ full_name, email, phone, password }) => {
      setError(null);
      try {
        await api.register({ full_name, email, phone, password });
        return login(email, password);
      } catch (err) {
        setError(err.message);
        return false;
      }
    },
    [login]
  );

  const logout = useCallback(async () => {
    await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
    setAccessToken(null);
    setUser(null);
  }, []);

  // For callers (like the offline sync engine) that need a fresh access
  // token on demand — e.g. after being offline long enough for the 15-minute
  // access token to expire before signal came back. Re-reads the refresh
  // token from SecureStore rather than keeping it in JS state.
  const refreshAccessToken = useCallback(async () => {
    const storedRefreshToken = await SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
    if (!storedRefreshToken) throw new Error('No refresh token available');

    try {
      const { accessToken: newAccessToken } = await api.refresh(storedRefreshToken);
      setAccessToken(newAccessToken);
      return newAccessToken;
    } catch (err) {
      // Refresh token itself is invalid/expired (e.g. >30 days offline) —
      // nothing to do but sign out; local unsynced data is untouched and
      // will sync once the user logs back in.
      await logout();
      throw err;
    }
  }, [logout]);

  const value = {
    user,
    accessToken,
    isAuthenticated: !!user,
    isLoading,
    error,
    login,
    register,
    logout,
    refreshAccessToken,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
