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
