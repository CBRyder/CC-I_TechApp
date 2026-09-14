import React from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { useTheme } from 'react-native-paper';
import { spacing } from './theme';

export default function ScreenContainer({ children, style, contentContainerStyle }) {
  const theme = useTheme();
  return (
    <ScrollView
      style={[{ flex: 1, backgroundColor: theme.colors.background }, style]}
      contentContainerStyle={[styles.content, contentContainerStyle]}
    >
      {children}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: spacing.lg,
    flexGrow: 1,
  },
});
