import React from 'react';
import { View, Text, TextInput, StyleSheet } from 'react-native';
import { useTheme } from 'react-native-paper';
import { spacing, radius, touchTarget } from './theme';

export default function TextField({ label, error, style, ...inputProps }) {
  const theme = useTheme();
  return (
    <View style={[styles.container, style]}>
      {label ? (
        <Text style={[styles.label, { color: theme.colors.onSurfaceVariant }]}>{label}</Text>
      ) : null}
      <TextInput
        placeholderTextColor={theme.colors.onSurfaceVariant}
        style={[
          styles.input,
          {
            borderColor: error ? theme.colors.error : theme.colors.outline,
            color: theme.colors.onSurface,
            backgroundColor: theme.colors.surface,
          },
        ]}
        {...inputProps}
      />
      {error ? <Text style={[styles.error, { color: theme.colors.error }]}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginBottom: spacing.md },
  label: { fontSize: 13, marginBottom: spacing.xs, fontWeight: '600' },
  input: {
    minHeight: touchTarget,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    fontSize: 16,
  },
  error: { fontSize: 12, marginTop: spacing.xs },
});
