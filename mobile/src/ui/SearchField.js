import React from 'react';
import { View, TextInput, StyleSheet } from 'react-native';
import { useTheme } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { spacing, radius, touchTarget } from './theme';

export default function SearchField({ value, onChangeText, placeholder, style }) {
  const theme = useTheme();
  return (
    <View
      style={[
        styles.container,
        { borderColor: theme.colors.outline, backgroundColor: theme.colors.surface },
        style,
      ]}
    >
      <MaterialCommunityIcons name="magnify" size={20} color={theme.colors.onSurfaceVariant} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={theme.colors.onSurfaceVariant}
        style={[styles.input, { color: theme.colors.onSurface }]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: touchTarget,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
  },
  input: { flex: 1, fontSize: 16 },
});
