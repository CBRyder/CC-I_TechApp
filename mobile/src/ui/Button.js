import React from 'react';
import { Pressable, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { useTheme } from 'react-native-paper';
import { spacing, radius, touchTarget } from './theme';

// variant: 'primary' | 'secondary' | 'outline' | 'danger' | 'text'
export default function Button({ children, onPress, variant = 'primary', disabled, loading, style }) {
  const theme = useTheme();
  const palette = buildPalette(theme, variant);

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.base,
        {
          backgroundColor: palette.background,
          borderColor: palette.border,
          borderWidth: palette.borderWidth,
        },
        pressed && !disabled && !loading && { opacity: 0.85 },
        (disabled || loading) && { opacity: 0.5 },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={palette.text} />
      ) : (
        <Text style={[styles.label, { color: palette.text }]}>{children}</Text>
      )}
    </Pressable>
  );
}

function buildPalette(theme, variant) {
  switch (variant) {
    case 'secondary':
      return { background: theme.colors.secondary, text: '#1A1D21', border: 'transparent', borderWidth: 0 };
    case 'outline':
      return {
        background: 'transparent',
        text: theme.colors.primary,
        border: theme.colors.primary,
        borderWidth: 2,
      };
    case 'danger':
      return { background: theme.colors.error, text: '#FFFFFF', border: 'transparent', borderWidth: 0 };
    case 'text':
      return { background: 'transparent', text: theme.colors.primary, border: 'transparent', borderWidth: 0 };
    case 'primary':
    default:
      return { background: theme.colors.primary, text: '#FFFFFF', border: 'transparent', borderWidth: 0 };
  }
}

const styles = StyleSheet.create({
  base: {
    minHeight: touchTarget,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
  },
});
