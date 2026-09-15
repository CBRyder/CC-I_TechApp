// Base URL for the backend API.
// - iOS simulator: http://localhost:3000 also works.
// - Physical device via Expo Go on the SAME Wi-Fi as your PC: your
//   machine's LAN IP (find with `ipconfig`, look for IPv4 Address), e.g.
//   'http://192.168.1.153:3000'.
// - Physical device off that Wi-Fi (cellular, different network): needs a
//   tunnel — TEMPORARY, dies when the tunnel process stops or this session
//   ends. Swap back to the LAN IP once you're back on the same Wi-Fi.
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

export function updateProfile(payload, accessToken) {
  return request('/me', { method: 'PATCH', body: payload, accessToken });
}

export function changePassword(payload, accessToken) {
  return request('/me/change-password', { method: 'POST', body: payload, accessToken });
}

// --- Preferences ---

export function getPreferences(accessToken) {
  return request('/preferences', { accessToken });
}

export function setPreference(key, value, accessToken) {
  return request(`/preferences/${encodeURIComponent(key)}`, {
    method: 'PUT',
    body: { value },
    accessToken,
  });
}

// --- Jobs ---

export function listJobs(accessToken) {
  return request('/jobs', { accessToken });
}

// Notes other techs left on past visits to this job.
export function getJobHistory(jobId, accessToken) {
  return request(`/jobs/${jobId}/history`, { accessToken });
}

// date: 'YYYY-MM-DD', the device's own local date.
export function getAssignedJobs(date, accessToken) {
  return request(`/jobs/assigned?date=${encodeURIComponent(date)}`, { accessToken });
}

// --- Offline-first sync: upserts by client_id, safe to retry ---

export function syncTimeEntry(payload, accessToken) {
  return request('/time-entries/sync', { method: 'PUT', body: payload, accessToken });
}

export function syncJobSegment(payload, accessToken) {
  return request('/job-segments/sync', { method: 'PUT', body: payload, accessToken });
}

export function listParts(accessToken) {
  return request('/parts', { accessToken });
}

export function syncJobCompletion(payload, accessToken) {
  return request('/job-completions/sync', { method: 'PUT', body: payload, accessToken });
}

export function syncCompletionPart(payload, accessToken) {
  return request('/job-completions/parts/sync', { method: 'PUT', body: payload, accessToken });
}

export function presignCompletionPhoto(payload, accessToken) {
  return request('/job-completions/photos/presign', { method: 'POST', body: payload, accessToken });
}

export function confirmCompletionPhoto(payload, accessToken) {
  return request('/job-completions/photos/confirm', { method: 'PUT', body: payload, accessToken });
}

export { ApiError };
