import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { stateColors, spacing, radius } from './theme';

const LABELS = {
  travel: 'Traveling',
  work: 'Working',
  pause: 'Paused',
  pending: 'Pending',
  synced: 'Synced',
  at_shop: 'At the Shop',
  ready: 'Ready',
  in_progress: 'In Progress',
  shop_return: 'Shop Return',
  completed: 'Completed',
};

// state: any key in stateColors (theme.js) — add more there as this app's
// vocabulary of states grows (e.g. a timesheet status).
export default function StatusPill({ state, label }) {
  const color = stateColors[state] || '#888888';
  return (
    <View style={[styles.pill, { backgroundColor: color + '22', borderColor: color }]}>
      <View style={[styles.dot, { backgroundColor: color }]} />
      <Text style={[styles.label, { color }]}>{label || LABELS[state] || state}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: spacing.xs,
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
});
