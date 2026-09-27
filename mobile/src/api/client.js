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

export function register({ full_name, username, email, phone, password }) {
  return request('/auth/register', {
    method: 'POST',
    body: { full_name, username, email, phone, password },
  });
}

// deviceId is a per-installation identifier stored in SecureStore.
export function login({ identifier, password, deviceId }) {
  return request('/auth/login', {
    method: 'POST',
    body: { identifier, password, deviceId },
  });
}

// Returns { accessToken, refreshToken, user }. Rotation means callers must
// persist the returned refreshToken every time.
export function refresh(refreshToken, deviceId) {
  return request('/auth/refresh', {
    method: 'POST',
    body: { refreshToken, deviceId },
  });
}

export function logout(refreshToken, deviceId) {
  return request('/auth/logout', {
    method: 'POST',
    body: { refreshToken, deviceId },
  });
}

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

export function getJobHistory(jobId, accessToken) {
  return request(`/jobs/${jobId}/history`, { accessToken });
}

export function getAssignedJobs(date, accessToken) {
  return request(`/jobs/assigned?date=${encodeURIComponent(date)}`, { accessToken });
}

export function createJob(job, accessToken) {
  return request('/jobs', { method: 'POST', body: job, accessToken });
}

// visitType ('shop' | 'road' | undefined) — see reassignVisit's comment.
export function assignVisit({ jobId, userId, date, visitType }, accessToken) {
  return request(`/jobs/${jobId}/assign`, {
    method: 'POST',
    body: { user_id: userId, date, visit_type: visitType },
    accessToken,
  });
}

export function unassignVisit({ jobId, userId, date }, accessToken) {
  return request(
    `/jobs/${jobId}/assign?user_id=${userId}&date=${encodeURIComponent(date)}`,
    { method: 'DELETE', accessToken }
  );
}

// --- Timesheet ---

export function getTimesheet(start, end, accessToken) {
  return request(`/timesheet?start=${start}&end=${end}`, { accessToken });
}

export function getAdminTimesheet(start, end, accessToken) {
  return request(`/admin/timesheet?start=${start}&end=${end}`, { accessToken });
}

export function getAdminTechTimesheet(userId, start, end, accessToken) {
  return request(`/admin/timesheet/${userId}?start=${start}&end=${end}`, { accessToken });
}

// Deletes resolve to { deleted_count, deleted_hours, skipped } — entries
// still clocked in or holding a completed job are skipped, not deleted.
export function deleteTimeEntry(entryId, accessToken) {
  return request(`/admin/time-entries/${entryId}`, { method: 'DELETE', accessToken });
}

export function deleteTechHoursInRange(userId, start, end, accessToken) {
  return request(`/admin/timesheet/${userId}?start=${start}&end=${end}`, {
    method: 'DELETE',
    accessToken,
  });
}

export function deleteAllTechHours(userId, accessToken) {
  return request(`/admin/timesheet/${userId}/all`, { method: 'DELETE', accessToken });
}

// --- Offline-first sync ---

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

export function listAdminSessions(accessToken) {
  return request('/admin/sessions', { accessToken });
}

export function listAdminAudit(accessToken, limit = 100) {
  return request(`/admin/audit?limit=${encodeURIComponent(limit)}`, { accessToken });
}

export function revokeAdminSession(sessionId, accessToken) {
  return request(`/admin/sessions/${sessionId}`, { method: 'DELETE', accessToken });
}

export function updateUserRoles(userId, roles, accessToken) {
  return request(`/admin/users/${userId}/roles`, {
    method: 'PUT',
    body: { roles },
    accessToken,
  });
}

export function deleteUser(userId, accessToken) {
  return request(`/admin/users/${userId}`, { method: 'DELETE', accessToken });
}

export function adminResetPassword(userId, newPassword, accessToken) {
  return request(`/admin/users/${userId}/reset-password`, {
    method: 'POST',
    body: { new_password: newPassword },
    accessToken,
  });
}

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

export function updateJob(jobId, { customer_name, location_name }, accessToken) {
  return request(`/admin/jobs/${jobId}`, {
    method: 'PUT',
    body: { customer_name, location_name },
    accessToken,
  });
}

export function updateUserTechTypes(userId, techTypes, accessToken) {
  return request(`/admin/users/${userId}/tech-types`, {
    method: 'PUT',
    body: { tech_types: techTypes },
    accessToken,
  });
}

export function listCustomers(accessToken) {
  return request('/admin/customers', { accessToken });
}

export function createCustomer(customer, accessToken) {
  return request('/admin/customers', { method: 'POST', body: customer, accessToken });
}

// visitType ('shop' | 'road' | undefined) explicitly overrides the usual
// tech_types + travel-segment inference for this one visit — mainly for a
// tech who's both, where a dispatcher needs to say up front which kind
// this particular visit is.
export function reassignVisit(assignmentId, { userId, date, visitType }, accessToken) {
  return request(`/admin/visits/${assignmentId}/reassign`, {
    method: 'PATCH',
    body: { user_id: userId, assigned_date: date, visit_type: visitType },
    accessToken,
  });
}

export function deleteVisit(assignmentId, accessToken) {
  return request(`/admin/visits/${assignmentId}`, { method: 'DELETE', accessToken });
}

export function setCompletionPO(completionId, poNumber, accessToken) {
  return request(`/admin/job-completions/${completionId}/po`, {
    method: 'PUT',
    body: { po_number: poNumber },
    accessToken,
  });
}

export function reopenCompletion(completionId, accessToken) {
  return request(`/admin/job-completions/${completionId}/reopen`, {
    method: 'POST',
    accessToken,
  });
}

export { ApiError };

// --- Inventory (admin + supervisor) ---

export function getInventoryParts(accessToken) {
  return request('/inventory/parts', { accessToken });
}

export function getInventoryPart(partId, accessToken) {
  return request(`/inventory/parts/${partId}`, { accessToken });
}

export function createInventoryPart(fields, accessToken) {
  return request('/inventory/parts', { method: 'POST', body: fields, accessToken });
}

export function updateInventoryPart(partId, fields, accessToken) {
  return request(`/inventory/parts/${partId}`, { method: 'PUT', body: fields, accessToken });
}

// `adjustment` is either { change, note } or { count, note } (a physical count).
export function adjustInventoryStock(partId, adjustment, accessToken) {
  return request(`/inventory/parts/${partId}/adjust`, { method: 'POST', body: adjustment, accessToken });
}

export function getPurchaseOrders(status, accessToken) {
  return request(`/inventory/purchase-orders${status ? `?status=${status}` : ''}`, { accessToken });
}

export function getPurchaseOrder(poId, accessToken) {
  return request(`/inventory/purchase-orders/${poId}`, { accessToken });
}

// `po` is { vendor, notes, items: [{ part_id, quantity }] }.
export function createPurchaseOrder(po, accessToken) {
  return request('/inventory/purchase-orders', { method: 'POST', body: po, accessToken });
}

export function updatePurchaseOrder(poId, po, accessToken) {
  return request(`/inventory/purchase-orders/${poId}`, { method: 'PUT', body: po, accessToken });
}

// action: 'order' | 'receive' | 'cancel'
export function setPurchaseOrderStatus(poId, action, accessToken) {
  return request(`/inventory/purchase-orders/${poId}/${action}`, { method: 'POST', accessToken });
}
