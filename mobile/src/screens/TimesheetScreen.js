import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, PanResponder, Pressable, StyleSheet, View } from 'react-native';
import { IconButton, Text, useTheme } from 'react-native-paper';
import { Calendar } from 'react-native-calendars';
import { useAuth } from '../context/AuthContext';
import * as api from '../api/client';
import { ScreenContainer, SegmentedTabs, EmptyState, spacing, radius } from '../ui';
import { addDays, todayString, workWeekOf } from '../utils/workWeek';
import TimesheetBody from './TimesheetBody';

const MODES = ['Day', 'Work Week'];
const SWIPE_DISTANCE = 50;

function parseLocal(dateStr) {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day);
}

function shortDate(dateStr) {
  return parseLocal(dateStr).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function dayLabel(dateStr, today) {
  const long = parseLocal(dateStr).toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  });
  if (dateStr === today) return `Today · ${long}`;
  if (dateStr === addDays(today, -1)) return `Yesterday · ${long}`;
  return long;
}

// Calendar highlight: one day, or the whole Wed–Tue week.
function markedFor(range, color) {
  const marks = {};
  for (let d = range.start; d <= range.end; d = addDays(d, 1)) {
    marks[d] = { startingDay: d === range.start, endingDay: d === range.end, color, textColor: '#FFFFFF' };
  }
  return marks;
}

// A tech's own hours. Opens on today (that day's hours + the jobs worked);
// swipe left/right (or the arrows) to step a day at a time. "Work Week"
// automatically selects the Wed–Tue payroll week containing whichever day
// you were on, and swiping then steps a week at a time. Tapping the date
// opens a calendar — in week mode any day you pick selects its whole week.
// Never steps past today (there's nothing to see in the future).
export default function TimesheetScreen() {
  const { accessToken } = useAuth();
  const theme = useTheme();
  const today = todayString();
  const [mode, setMode] = useState(MODES[0]);
  const [day, setDay] = useState(today); // the anchor — week mode shows this day's week
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  const isWeek = mode === 'Work Week';
  const range = useMemo(() => (isWeek ? workWeekOf(day) : { start: day, end: day }), [isWeek, day]);
  const step = isWeek ? 7 : 1;
  const canGoForward = isWeek ? range.end < today : day < today;

  const load = useCallback(async () => {
    setError(null);
    try {
      const result = await api.getTimesheet(range.start, range.end, accessToken);
      setData(result);
    } catch (err) {
      setError(err.message);
    }
  }, [range.start, range.end, accessToken]);

  useEffect(() => {
    setData(null);
    load();
  }, [load]);

  const go = useCallback(
    (direction) => {
      setDay((current) => {
        const next = addDays(current, direction * step);
        // Forward in week mode can land after today (mid-week) — clamp to
        // today so the day view still makes sense when switching back.
        return next > today ? today : next;
      });
    },
    [step, today]
  );

  // Swipe handling lives in a ref'd PanResponder that always calls the
  // latest `go`/`canGoForward` (the responder itself is created once).
  const latest = useRef({ go, canGoForward });
  latest.current = { go, canGoForward };
  const pan = useRef(
    PanResponder.create({
      // Only claim clearly-horizontal drags, so vertical scrolling still works.
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 20 && Math.abs(g.dx) > Math.abs(g.dy) * 2,
      onPanResponderRelease: (_, g) => {
        if (g.dx <= -SWIPE_DISTANCE && latest.current.canGoForward) latest.current.go(1);
        else if (g.dx >= SWIPE_DISTANCE) latest.current.go(-1);
      },
    })
  ).current;

  const label = isWeek
    ? `${range.start <= today && today <= range.end ? 'This Week · ' : ''}${shortDate(range.start)} – ${shortDate(range.end)}`
    : dayLabel(day, today);

  return (
    <ScreenContainer>
      <View {...pan.panHandlers} style={{ flexGrow: 1 }}>
        <SegmentedTabs options={MODES} value={mode} onChange={setMode} />

        <View style={[styles.stepper, { borderColor: theme.colors.primary }]}>
          <IconButton
            icon="chevron-left"
            iconColor={theme.colors.primary}
            onPress={() => go(-1)}
            accessibilityLabel={isWeek ? 'Previous week' : 'Previous day'}
          />
          <Pressable style={styles.stepperLabel} onPress={() => setCalendarOpen((o) => !o)}>
            <Text
              variant="titleMedium"
              style={{ color: theme.colors.primary, fontWeight: '700', textAlign: 'center' }}
            >
              {label}
            </Text>
            <Text style={{ color: theme.colors.onSurfaceVariant, fontSize: 12, textAlign: 'center' }}>
              {calendarOpen ? 'Tap to close calendar' : 'Swipe or tap to pick a date'}
            </Text>
          </Pressable>
          <IconButton
            icon="chevron-right"
            iconColor={theme.colors.primary}
            disabled={!canGoForward}
            onPress={() => go(1)}
            accessibilityLabel={isWeek ? 'Next week' : 'Next day'}
          />
        </View>

        {!isWeek && day !== today ? (
          <Text
            onPress={() => setDay(today)}
            style={{ color: theme.colors.primary, textAlign: 'center', marginBottom: spacing.sm }}
          >
            Back to today
          </Text>
        ) : null}

        {calendarOpen && (
          <Calendar
            current={day}
            maxDate={today}
            markingType="period"
            markedDates={markedFor(range, theme.colors.primary)}
            onDayPress={(d) => {
              setDay(d.dateString);
              setCalendarOpen(false);
            }}
            style={styles.calendar}
            theme={{
              todayTextColor: theme.colors.primary,
              arrowColor: theme.colors.primary,
            }}
          />
        )}

        {error ? (
          <EmptyState message={`Couldn't load timesheet: ${error}`} />
        ) : !data ? (
          <View style={{ paddingTop: 40, alignItems: 'center' }}>
            <ActivityIndicator size="large" />
          </View>
        ) : (
          <TimesheetBody data={data} period={isWeek ? 'week' : 'day'} />
        )}
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 2,
    borderRadius: radius.md,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  stepperLabel: { flex: 1, paddingVertical: spacing.sm },
  calendar: { borderRadius: radius.md, overflow: 'hidden', marginBottom: spacing.sm },
});
