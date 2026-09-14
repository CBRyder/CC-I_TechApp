import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useTheme } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { stateColors, spacing, radius } from './theme';

// A card for one entry in a chronological feed — a plain time block (e.g.
// "Daily clock-in & clock-out") or a job visit, same shape either way. The
// colored left bar reads status at a glance — `state` maps to theme.js's
// stateColors, same lookup StatusPill uses.
export default function VisitCard({
  state,
  statusLabel,
  tag,
  title,
  address,
  category,
  time,
  duration,
  onPress,
  style,
}) {
  const theme = useTheme();
  const accentColor = stateColors[state] || theme.colors.outline;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        {
          backgroundColor: theme.colors.elevation?.level1 ?? theme.colors.surface,
          borderLeftColor: accentColor,
        },
        pressed && !!onPress && { opacity: 0.7 },
        style,
      ]}
    >
      <View style={styles.main}>
        {statusLabel ? (
          <Text style={[styles.statusLabel, { color: theme.colors.onSurfaceVariant }]}>
            {statusLabel}
          </Text>
        ) : null}
        {tag ? <Text style={[styles.tag, { color: theme.colors.onSurfaceVariant }]}>{tag}</Text> : null}
        <Text style={[styles.title, { color: theme.colors.onSurface }]}>{title}</Text>
        {address ? (
          <Text style={[styles.address, { color: theme.colors.onSurfaceVariant }]}>{address}</Text>
        ) : null}
        {category ? (
          <Text style={[styles.category, { color: theme.colors.onSurfaceVariant }]}>{category}</Text>
        ) : null}
      </View>

      {(time || duration) && (
        <View style={styles.timeColumn}>
          {time ? <Text style={[styles.time, { color: theme.colors.onSurface }]}>{time}</Text> : null}
          {duration ? (
            <View style={styles.durationRow}>
              <MaterialCommunityIcons
                name="clock-outline"
                size={13}
                color={theme.colors.onSurfaceVariant}
              />
              <Text style={[styles.duration, { color: theme.colors.onSurfaceVariant }]}>{duration}</Text>
            </View>
          ) : null}
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: spacing.md,
    borderRadius: radius.md,
    borderLeftWidth: 4,
    marginBottom: spacing.sm,
  },
  main: { flex: 1, marginRight: spacing.sm },
  statusLabel: { fontSize: 12, fontWeight: '600', marginBottom: 2 },
  tag: { fontSize: 13, marginBottom: 2 },
  title: { fontSize: 16, fontWeight: '700', marginTop: 2 },
  address: { fontSize: 13, marginTop: 4 },
  category: { fontSize: 13, marginTop: 6 },
  timeColumn: { alignItems: 'flex-end' },
  time: { fontSize: 14, fontWeight: '700' },
  durationRow: { flexDirection: 'row', alignItems: 'center', marginTop: 4, gap: 4 },
  duration: { fontSize: 12 },
});
