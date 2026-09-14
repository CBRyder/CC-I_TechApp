import React from 'react';
import { Text, StyleSheet } from 'react-native';
import { useTheme } from 'react-native-paper';
import { spacing } from './theme';

export default function SectionHeader({ children, style }) {
  const theme = useTheme();
  return <Text style={[styles.text, { color: theme.colors.onSurface }, style]}>{children}</Text>;
}

const styles = StyleSheet.create({
  text: {
    fontSize: 13,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
});
