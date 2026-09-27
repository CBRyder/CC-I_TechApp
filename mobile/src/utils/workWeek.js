function toLocalDateString(date) {
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date - offset).toISOString().slice(0, 10);
}

// The payroll week runs Wednesday through the following Tuesday (the
// Sat/Sun in the middle are still part of the period, just not part of the
// usual Wed/Thu/Fri/Mon/Tue work week) — this finds the Wednesday on or
// before today and returns that 7-day span as the default timesheet range.
export function currentWorkWeek() {
  const today = new Date();
  const daysSinceWednesday = (today.getDay() - 3 + 7) % 7;
  const start = new Date(today);
  start.setDate(today.getDate() - daysSinceWednesday);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  return { start: toLocalDateString(start), end: toLocalDateString(end) };
}

// --- plain YYYY-MM-DD date helpers (local calendar dates, no time zone
// math — same convention as the timesheet endpoints) ---

function parseLocal(dateStr) {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day);
}

export function todayString() {
  return toLocalDateString(new Date());
}

export function addDays(dateStr, days) {
  const d = parseLocal(dateStr);
  d.setDate(d.getDate() + days);
  return toLocalDateString(d);
}

// The Wed–Tue payroll week that contains `dateStr`.
export function workWeekOf(dateStr) {
  const d = parseLocal(dateStr);
  const daysSinceWednesday = (d.getDay() - 3 + 7) % 7;
  const start = addDays(dateStr, -daysSinceWednesday);
  return { start, end: addDays(start, 6) };
}
