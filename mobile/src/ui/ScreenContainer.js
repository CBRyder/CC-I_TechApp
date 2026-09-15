import React from 'react';
import { View, ScrollView, StyleSheet } from 'react-native';
import { useTheme } from 'react-native-paper';
import { spacing } from './theme';

// `header`, if given, renders full-width above the padded scroll area —
// e.g. a ClockBanner that needs to span edge-to-edge instead of sitting
// inset like everything else on the screen.
export default function ScreenContainer({ children, header, style, contentContainerStyle }) {
  const theme = useTheme();
  return (
    <View style={[{ flex: 1, backgroundColor: theme.colors.background }, style]}>
      {header}
      <ScrollView contentContainerStyle={[styles.content, contentContainerStyle]}>
        {children}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: spacing.lg,
    flexGrow: 1,
  },
});
