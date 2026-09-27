import React from 'react';
import { View } from 'react-native';
import { IconButton, Text, useTheme } from 'react-native-paper';
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
// /timesheet or GET /admin/timesheet/:userId returned. `onDeleteDay`, if
// given (admin only), adds a trash icon to each Daily Hours row. `period`
// ('day' | 'week' | 'range') only changes the empty-state wording.
const PERIOD_WORDS = { day: 'on this day', week: 'this work week', range: 'in this range' };

export default function TimesheetBody({ data, onDeleteDay, period = 'range' }) {
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
        <EmptyState message={`No clocked hours ${PERIOD_WORDS[period]}.`} />
      ) : (
        days.map((day) => (
          <ListRow
            key={day.date}
            title={formatDate(day.date)}
            subtitle={`Billable ${hrs(day.billable_hours)} · Non-billable ${hrs(day.non_billable_hours)}`}
            trailing={
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Text style={{ fontWeight: '700' }}>{hrs(day.daily_hours)}</Text>
                {onDeleteDay ? (
                  <IconButton
                    icon="delete-outline"
                    size={20}
                    iconColor={theme.colors.error}
                    onPress={() => onDeleteDay(day.date, formatDate(day.date))}
                    accessibilityLabel={`Delete hours for ${formatDate(day.date)}`}
                    style={{ margin: 0, marginLeft: spacing.xs }}
                  />
                ) : null}
              </View>
            }
          />
        ))
      )}

      <SectionHeader>Job Hours</SectionHeader>
      {jobs.length === 0 ? (
        <EmptyState message={`No job hours logged ${PERIOD_WORDS[period]}.`} />
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
