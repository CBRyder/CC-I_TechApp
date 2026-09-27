import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, View } from 'react-native';
import { IconButton, Text, useTheme } from 'react-native-paper';
import { useAuth } from '../../context/AuthContext';
import * as api from '../../api/client';
import {
  Button,
  ScreenContainer,
  CalendarRangePicker,
  EmptyState,
  ListRow,
  SectionHeader,
  spacing,
} from '../../ui';
import TimesheetBody from '../TimesheetBody';

function parseDate(dateStr) {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function shortDate(dateStr) {
  return parseDate(dateStr).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function clockTime(iso) {
  return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

// Same Wednesday-through-Tuesday payroll week as utils/workWeek.js.
function isWorkWeek(start, end) {
  const s = parseDate(start);
  const e = parseDate(end);
  return s.getDay() === 3 && Math.round((e - s) / 86400000) === 6;
}

function entryBlockedNote(entry) {
  if (!entry.clock_out_at) return 'Still clocked in, so it can’t be deleted yet';
  if (entry.completed_jobs.length) {
    return `Has completed job ${entry.completed_jobs.join(', ')}, so it can’t be deleted`;
  }
  return null;
}

// Plain-language result of any delete — what went, and what was kept and why.
function resultMessage(result) {
  const lines = [
    `Deleted ${result.deleted_count} ${result.deleted_count === 1 ? 'entry' : 'entries'} (${result.deleted_hours.toFixed(2)} hrs).`,
  ];
  const clockedIn = result.skipped.filter((s) => s.reason === 'clocked_in');
  const completed = result.skipped.filter((s) => s.reason === 'completed_job');
  if (clockedIn.length) {
    lines.push(`Kept ${clockedIn.length} still clocked in.`);
  }
  if (completed.length) {
    const jobs = [...new Set(completed.flatMap((s) => s.completed_jobs))];
    lines.push(`Kept ${completed.length} with completed job${jobs.length === 1 ? '' : 's'} ${jobs.join(', ')}.`);
  }
  return lines.join('\n\n');
}

export default function AdminTechTimesheetScreen({ route }) {
  const { userId, fullName, start: initialStart, end: initialEnd } = route.params;
  const { accessToken } = useAuth();
  const theme = useTheme();
  const [range, setRange] = useState({ start: initialStart, end: initialEnd });
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const result = await api.getAdminTechTimesheet(userId, range.start, range.end, accessToken);
      setData(result);
    } catch (err) {
      setError(err.message);
    }
  }, [userId, range, accessToken]);

  useEffect(() => {
    setData(null);
    load();
  }, [load]);

  // Every delete goes through here: confirm → call → report → reload.
  const confirmAndDelete = (title, message, run) => {
    Alert.alert(title, message, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          setDeleting(true);
          try {
            const result = await run();
            Alert.alert('Hours deleted', resultMessage(result));
          } catch (err) {
            Alert.alert("Couldn't delete hours", err.message);
          } finally {
            setDeleting(false);
            load();
          }
        },
      },
    ]);
  };

  const deleteEntry = (entry) =>
    confirmAndDelete(
      'Delete this clock entry?',
      `${fullName} · ${shortDate(entry.date)}, ${clockTime(entry.clock_in_at)} – ${clockTime(entry.clock_out_at)} (${entry.hours.toFixed(2)} hrs), including its travel/work time. This can’t be undone.`,
      () => api.deleteTimeEntry(entry.id, accessToken)
    );

  const deleteDay = (date, label) =>
    confirmAndDelete(
      `Delete ${label}?`,
      `Deletes all of ${fullName}’s hours on ${label}. Entries with a completed job, or that are still clocked in, are kept. This can’t be undone.`,
      () => api.deleteTechHoursInRange(userId, date, date, accessToken)
    );

  // `entries` only exists once the backend with the delete endpoints is live.
  const entries = data?.entries || [];
  const workWeek = isWorkWeek(range.start, range.end);
  const rangeLabel = `${shortDate(range.start)} – ${shortDate(range.end)}`;

  const deleteRange = () =>
    confirmAndDelete(
      workWeek ? 'Delete this work week?' : 'Delete these dates?',
      `Deletes all of ${fullName}’s hours from ${rangeLabel}. Entries with a completed job, or that are still clocked in, are kept. This can’t be undone.`,
      () => api.deleteTechHoursInRange(userId, range.start, range.end, accessToken)
    );

  // Two-step on purpose — this one isn't limited to the dates on screen.
  const deleteAll = () =>
    Alert.alert(
      `Delete ALL of ${fullName}’s hours?`,
      'Every clock entry this tech has ever logged, on every date — not just the dates shown. Entries with a completed job, or that are still clocked in, are kept.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Continue',
          style: 'destructive',
          onPress: () =>
            confirmAndDelete(
              'Are you sure?',
              `This permanently deletes ${fullName}’s entire time history and can’t be undone.`,
              () => api.deleteAllTechHours(userId, accessToken)
            ),
        },
      ]
    );

  return (
    <ScreenContainer>
      <Text variant="titleLarge" style={{ marginBottom: spacing.sm }}>
        {fullName}
      </Text>
      <CalendarRangePicker
        start={range.start}
        end={range.end}
        onChange={(start, end) => setRange({ start, end })}
      />
      {error ? (
        <EmptyState message={`Couldn't load timesheet: ${error}`} />
      ) : !data ? (
        <View style={{ paddingTop: 40, alignItems: 'center' }}>
          <ActivityIndicator size="large" />
        </View>
      ) : (
        <View>
          <TimesheetBody data={data} onDeleteDay={deleting ? undefined : deleteDay} />

          <SectionHeader>Clock Entries</SectionHeader>
          {entries.length === 0 ? (
            <EmptyState message="No clock entries in this range." />
          ) : (
            entries.map((entry) => {
              const blocked = entryBlockedNote(entry);
              return (
                <ListRow
                  key={entry.id}
                  title={`${shortDate(entry.date)} · ${clockTime(entry.clock_in_at)} – ${
                    entry.clock_out_at ? clockTime(entry.clock_out_at) : 'now'
                  }`}
                  subtitle={blocked || `${entry.hours.toFixed(2)} hrs`}
                  trailing={
                    <IconButton
                      icon={blocked ? 'lock-outline' : 'delete-outline'}
                      size={20}
                      iconColor={blocked ? theme.colors.onSurfaceVariant : theme.colors.error}
                      disabled={!!blocked || deleting}
                      onPress={() => deleteEntry(entry)}
                      accessibilityLabel="Delete this clock entry"
                      style={{ margin: 0 }}
                    />
                  }
                />
              );
            })
          )}

          <SectionHeader>Delete Hours</SectionHeader>
          <Button
            variant="outline"
            onPress={deleteRange}
            disabled={deleting || entries.length === 0}
            subtitle={rangeLabel}
            style={{ marginBottom: spacing.sm }}
          >
            {workWeek ? 'Delete Work Week' : 'Delete These Dates'}
          </Button>
          <Button variant="danger" onPress={deleteAll} loading={deleting}>
            Delete ALL Hours
          </Button>
        </View>
      )}
    </ScreenContainer>
  );
}
