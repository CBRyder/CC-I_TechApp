// Base URL for the backend API.
// - iOS simulator: http://localhost:3000 also works.
// - Physical device via Expo Go: needs your machine's LAN IP (find with
//   `ipconfig`, look for IPv4 Address) so the phone can reach your PC over
//   Wi-Fi. Update this if your machine's IP changes (e.g. new network).
export const API_BASE_URL = 'http://192.168.1.153:3000';

class ApiError extends Error {
  constructor(message, status, body) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}

async function request(path, { method = 'GET', body, accessToken } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

  const res = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  const data = text ? JSON.parse(text) : null;

  if (!res.ok) {
    throw new ApiError(data?.error || `Request failed (${res.status})`, res.status, data);
  }

  return data;
}

// --- Auth endpoints ---

// Returns the created user (no tokens — call login() after to start a session).
export function register({ full_name, email, phone, password }) {
  return request('/auth/register', {
    method: 'POST',
    body: { full_name, email, phone, password },
  });
}

// Returns { accessToken, refreshToken, user }.
export function login({ email, password }) {
  return request('/auth/login', {
    method: 'POST',
    body: { email, password },
  });
}

// Returns { accessToken }.
export function refresh(refreshToken) {
  return request('/auth/refresh', {
    method: 'POST',
    body: { refreshToken },
  });
}

// Requires a valid access token. Returns the current user.
export function getMe(accessToken) {
  return request('/me', { accessToken });
}

export { ApiError };
