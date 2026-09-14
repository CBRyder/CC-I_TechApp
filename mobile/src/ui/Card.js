import React from 'react';
import { View, StyleSheet } from 'react-native';
import { useTheme } from 'react-native-paper';
import { spacing, radius } from './theme';

export default function Card({ children, style }) {
  const theme = useTheme();
  return (
    <View
      style={[
        styles.base,
        {
          backgroundColor: theme.colors.elevation?.level1 ?? theme.colors.surface,
          borderColor: theme.colors.outlineVariant,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: spacing.md,
  },
});
