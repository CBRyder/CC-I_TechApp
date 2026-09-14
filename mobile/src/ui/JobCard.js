import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useTheme } from 'react-native-paper';
import StatusPill from './StatusPill';
import { spacing, radius } from './theme';

// A ready-made block for one job in a list — job info plus an optional
// status pill. Pass any key from theme.js's stateColors as `status`, or
// leave it out for a plain job card with no status shown.
export default function JobCard({ job, status, onPress, style }) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: theme.colors.elevation?.level1 ?? theme.colors.surface,
          borderColor: theme.colors.outlineVariant,
        },
        pressed && !!onPress && { opacity: 0.7 },
        style,
      ]}
    >
      <View style={styles.text}>
        <Text style={[styles.name, { color: theme.colors.onSurface }]}>{job.name}</Text>
        <Text style={[styles.meta, { color: theme.colors.onSurfaceVariant }]}>
          {job.job_number}
          {job.address ? ` • ${job.address}` : ''}
        </Text>
      </View>
      {status ? <StatusPill state={status} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: spacing.sm,
  },
  text: { flex: 1, marginRight: spacing.sm },
  name: { fontSize: 16, fontWeight: '700' },
  meta: { fontSize: 13, marginTop: 2 },
});
