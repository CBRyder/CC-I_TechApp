import React, { useState } from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import { Text, useTheme } from 'react-native-paper';
import { Calendar } from 'react-native-calendars';
import { spacing, radius } from './theme';

function formatDisplay(dateStr) {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
}

function buildMarkedDates(start, end, color) {
  if (!start) return {};
  if (!end || end === start) {
    return { [start]: { startingDay: true, endingDay: true, color, textColor: '#FFFFFF' } };
  }
  const marks = {};
  let cursor = new Date(start + 'T00:00:00');
  const endDate = new Date(end + 'T00:00:00');
  while (cursor <= endDate) {
    const key = cursor.toISOString().slice(0, 10);
    marks[key] = {
      startingDay: key === start,
      endingDay: key === end,
      color,
      textColor: '#FFFFFF',
    };
    cursor.setDate(cursor.getDate() + 1);
  }
  return marks;
}

// A controlled Wed-Tue-or-whatever date RANGE picker: tap a day to start a
// new range, tap a later day to complete it. Tapping an earlier day than
// the current start restarts the range there instead of erroring — picking
// a range is rarely a one-shot gesture, easier to just let the second tap
// win than to make the person explicitly cancel and retry.
export default function CalendarRangePicker({ start, end, onChange }) {
  const theme = useTheme();
  const [expanded, setExpanded] = useState(false);
  const [pendingStart, setPendingStart] = useState(null);

  const handleDayPress = (day) => {
    const date = day.dateString;
    if (!pendingStart || date < pendingStart) {
      setPendingStart(date);
      return;
    }
    onChange(pendingStart, date);
    setPendingStart(null);
    setExpanded(false);
  };

  return (
    <View style={{ marginBottom: spacing.md }}>
      <Pressable
        onPress={() => {
          setPendingStart(null);
          setExpanded((e) => !e);
        }}
        style={[styles.header, { borderColor: theme.colors.primary }]}
      >
        <Text variant="titleMedium" style={{ color: theme.colors.primary, fontWeight: '700' }}>
          {formatDisplay(start)} – {formatDisplay(end)}
        </Text>
        <Text style={{ color: theme.colors.primary }}>{expanded ? 'Done' : 'Change Dates'}</Text>
      </Pressable>

      {expanded && (
        <Calendar
          current={start}
          markingType="period"
          markedDates={buildMarkedDates(pendingStart || start, pendingStart ? pendingStart : end, theme.colors.primary)}
          onDayPress={handleDayPress}
          style={styles.calendar}
          theme={{
            selectedDayBackgroundColor: theme.colors.primary,
            todayTextColor: theme.colors.primary,
            arrowColor: theme.colors.primary,
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 2,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  calendar: {
    marginTop: spacing.sm,
    borderRadius: radius.md,
    overflow: 'hidden',
  },
});
