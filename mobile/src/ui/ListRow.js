import React from 'react';
import { Pressable, View, Text, StyleSheet } from 'react-native';
import { useTheme } from 'react-native-paper';
import { spacing } from './theme';

// `compact` shrinks vertical padding and type size — for a list that needs
// to fit alongside other fixed content (e.g. sharing screen space with a
// non-scrolling footer) rather than being the only thing on the screen.
export default function ListRow({ title, subtitle, trailing, onPress, compact, style }) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        compact && styles.rowCompact,
        { borderBottomColor: theme.colors.outlineVariant },
        pressed && !!onPress && { opacity: 0.6 },
        style,
      ]}
    >
      <View style={styles.text}>
        <Text
          style={[styles.title, compact && styles.titleCompact, { color: theme.colors.onSurface }]}
        >
          {title}
        </Text>
        {subtitle ? (
          <Text
            style={[
              styles.subtitle,
              compact && styles.subtitleCompact,
              { color: theme.colors.onSurfaceVariant },
            ]}
          >
            {subtitle}
          </Text>
        ) : null}
      </View>
      {trailing}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowCompact: {
    paddingVertical: spacing.xs,
  },
  text: { flex: 1 },
  title: { fontSize: 16, fontWeight: '600' },
  titleCompact: { fontSize: 14 },
  subtitle: { fontSize: 13, marginTop: 2 },
  subtitleCompact: { fontSize: 11, marginTop: 0 },
});
