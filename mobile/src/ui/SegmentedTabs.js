import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useTheme } from 'react-native-paper';
import { spacing, radius } from './theme';

// A pill-style segmented filter — e.g. <SegmentedTabs options={['Past',
// 'Today', 'Future']} value={tab} onChange={setTab} />.
export default function SegmentedTabs({ options, value, onChange, style }) {
  const theme = useTheme();
  return (
    <View style={[styles.track, { backgroundColor: theme.colors.surfaceVariant }, style]}>
      {options.map((option) => {
        const selected = option === value;
        return (
          <Pressable
            key={option}
            onPress={() => onChange(option)}
            style={[styles.segment, selected && { backgroundColor: theme.colors.surface }]}
          >
            <Text
              style={[
                styles.label,
                { color: selected ? theme.colors.onSurface : theme.colors.onSurfaceVariant },
              ]}
            >
              {option}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: 'row',
    borderRadius: radius.pill,
    padding: 4,
  },
  segment: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    alignItems: 'center',
  },
  label: { fontSize: 14, fontWeight: '600' },
});
