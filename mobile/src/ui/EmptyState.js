import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from 'react-native-paper';
import { spacing } from './theme';

export default function EmptyState({ message }) {
  const theme = useTheme();
  return (
    <View style={styles.container}>
      <Text style={[styles.text, { color: theme.colors.onSurfaceVariant }]}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { paddingVertical: spacing.xl, alignItems: 'center' },
  text: { fontSize: 14, textAlign: 'center', paddingHorizontal: spacing.lg },
});
