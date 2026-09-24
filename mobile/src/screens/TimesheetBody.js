import React from 'react';
import { View } from 'react-native';
import { Text, useTheme } from 'react-native-paper';
import { ListRow, SectionHeader, EmptyState, spacing } from '../ui';

function formatDate(dateStr) {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

function hrs(n) {
  return `${n.toFixed(2)} hrs`;
}

function Stat({ label, value, color }) {
  return (
    <View style={{ flex: 1, alignItems: 'center' }}>
      <Text variant="titleLarge" style={{ color, fontWeight: '700' }}>
        {value.toFixed(1)}
      </Text>
      <Text variant="bodySmall" style={{ opacity: 0.7 }}>
        {label}
      </Text>
    </View>
  );
}

// Shared read-out for a timesheet's day-by-day and per-job hour breakdown —
// used both by a tech viewing their own Timesheet and by an admin drilled
// into a specific tech's from Admin Timesheet. `data` is whatever GET
// /timesheet or GET /admin/timesheet/:userId returned.
export default function TimesheetBody({ data }) {
  const theme = useTheme();
  if (!data) return null;

  const { days, jobs, totals } = data;

  return (
    <View>
      <View style={{ flexDirection: 'row', marginTop: spacing.sm }}>
        <Stat label="Daily" value={totals.daily_hours} color={theme.colors.onSurface} />
        <Stat label="Billable" value={totals.billable_hours} color={theme.colors.primary} />
        <Stat label="Non-billable" value={totals.non_billable_hours} color={theme.colors.error} />
      </View>

      <SectionHeader>Daily Hours</SectionHeader>
      {days.length === 0 ? (
        <EmptyState message="No clocked hours in this range." />
      ) : (
        days.map((day) => (
          <ListRow
            key={day.date}
            title={formatDate(day.date)}
            subtitle={`Billable ${hrs(day.billable_hours)} · Non-billable ${hrs(day.non_billable_hours)}`}
            trailing={<Text style={{ fontWeight: '700' }}>{hrs(day.daily_hours)}</Text>}
          />
        ))
      )}

      <SectionHeader>Job Hours</SectionHeader>
      {jobs.length === 0 ? (
        <EmptyState message="No job hours logged in this range." />
      ) : (
        jobs.map((job) => (
          <ListRow
            key={job.job_id}
            title={job.job_name}
            subtitle={`${job.job_number} · Travel ${hrs(job.travel_hours)} · Work ${hrs(job.work_hours)}`}
            trailing={<Text style={{ fontWeight: '700' }}>{hrs(job.billable_hours)}</Text>}
          />
        ))
      )}
    </View>
  );
}
