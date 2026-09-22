// Base URL for the backend API — deployed on Render, reachable from
// anywhere (no LAN/tunnel dependency). Free tier spins down after ~15 min
// idle, so the first request after a gap can take 30-50s to wake it up.
export const API_BASE_URL = 'https://cci-techapp-backend.onrender.com';

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
export function register({ full_name, username, email, phone, password }) {
  return request('/auth/register', {
    method: 'POST',
    body: { full_name, username, email, phone, password },
  });
}

// identifier: username or email. Returns { accessToken, refreshToken, user }.
export function login({ identifier, password }) {
  return request('/auth/login', {
    method: 'POST',
    body: { identifier, password },
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

// Admin-only. total_visits is optional.
export function createJob(job, accessToken) {
  return request('/jobs', { method: 'POST', body: job, accessToken });
}

// Creates a NEW visit (next visit_number) for a job, assigned to user_id on
// date ('YYYY-MM-DD'). Admin-only.
export function assignVisit({ jobId, userId, date }, accessToken) {
  return request(`/jobs/${jobId}/assign`, {
    method: 'POST',
    body: { user_id: userId, date },
    accessToken,
  });
}

export function unassignVisit({ jobId, userId, date }, accessToken) {
  return request(
    `/jobs/${jobId}/assign?user_id=${userId}&date=${encodeURIComponent(date)}`,
    { method: 'DELETE', accessToken }
  );
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

// --- admin ---

export function listAdminUsers(accessToken) {
  return request('/admin/users', { accessToken });
}

// roles: full replacement set, e.g. ['tech', 'admin'].
export function updateUserRoles(userId, roles, accessToken) {
  return request(`/admin/users/${userId}/roles`, {
    method: 'PUT',
    body: { roles },
    accessToken,
  });
}

// Soft delete — the account stops showing up anywhere, but its history stays.
export function deleteUser(userId, accessToken) {
  return request(`/admin/users/${userId}`, { method: 'DELETE', accessToken });
}

// status: 'at_shop' | 'ready' | 'in_progress' | 'shop_return' |
// 'completed', omit for all. q: free-text search against job number /
// visit code.
export function listAdminVisits({ status, q } = {}, accessToken) {
  const params = new URLSearchParams();
  if (status) params.set('status', status);
  if (q) params.set('q', q);
  const qs = params.toString();
  return request(`/admin/visits${qs ? `?${qs}` : ''}`, { accessToken });
}

export function getAdminVisit(assignmentId, accessToken) {
  return request(`/admin/visits/${assignmentId}`, { accessToken });
}

// Umbrella (customer_name) and/or location_name — either can be omitted to
// leave it unchanged.
export function updateJob(jobId, { customer_name, location_name }, accessToken) {
  return request(`/admin/jobs/${jobId}`, {
    method: 'PUT',
    body: { customer_name, location_name },
    accessToken,
  });
}

// techTypes: non-empty array from ['shop', 'road'] — a tech can be both.
export function updateUserTechTypes(userId, techTypes, accessToken) {
  return request(`/admin/users/${userId}/tech-types`, {
    method: 'PUT',
    body: { tech_types: techTypes },
    accessToken,
  });
}

// --- customers (directory for the job-creation picker) ---

export function listCustomers(accessToken) {
  return request('/admin/customers', { accessToken });
}

export function createCustomer(customer, accessToken) {
  return request('/admin/customers', { method: 'POST', body: customer, accessToken });
}

// Updates an EXISTING visit's tech/date in place (keeps its visit_number)
// — for correcting a dispatch mistake, not logging a new day of work.
export function reassignVisit(assignmentId, { userId, date }, accessToken) {
  return request(`/admin/visits/${assignmentId}/reassign`, {
    method: 'PATCH',
    body: { user_id: userId, assigned_date: date },
    accessToken,
  });
}

export function setCompletionPO(completionId, poNumber, accessToken) {
  return request(`/admin/job-completions/${completionId}/po`, {
    method: 'PUT',
    body: { po_number: poNumber },
    accessToken,
  });
}

export { ApiError };
