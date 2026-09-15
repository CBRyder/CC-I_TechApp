import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from 'react-native-paper';
import Button from './Button';
import { spacing } from './theme';

// A ready-made banner block: date + a clock in/out control. Pure UI — it
// takes what it needs as props rather than reading TrackingContext itself,
// so it stays reusable and previewable on its own (see ComponentGallery).
export default function ClockBanner({
  date,
  isClockedIn,
  clockedInSince,
  onClockIn,
  onClockOut,
  title,
  showHeading = true,
  showButton = true,
}) {
  const theme = useTheme();
  const heading =
    title || (isClockedIn ? `Clocked in since ${clockedInSince}` : 'Ready to start your day?');

  return (
    <View style={[styles.banner, { backgroundColor: theme.colors.primary }]}>
      <Text style={styles.date}>{date}</Text>
      {showHeading && <Text style={styles.heading}>{heading}</Text>}
      {showButton &&
        (isClockedIn ? (
          <Button variant="secondary" onPress={onClockOut}>
            Clock Out
          </Button>
        ) : (
          <Button variant="secondary" onPress={onClockIn}>
            Clock In
          </Button>
        ))}
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    padding: spacing.lg,
    paddingTop: spacing.xl,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
  },
  date: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
    opacity: 0.85,
    marginBottom: spacing.xs,
  },
  heading: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: spacing.md,
  },
});
