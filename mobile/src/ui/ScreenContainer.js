import React from 'react';
import { View, ScrollView, StyleSheet } from 'react-native';
import { useTheme } from 'react-native-paper';
import { spacing } from './theme';

// `header`, if given, renders full-width above the padded scroll area —
// e.g. a ClockBanner that needs to span edge-to-edge instead of sitting
// inset like everything else on the screen.
//
// `scroll={false}` turns the content area into a plain, non-scrolling flex
// View instead of a ScrollView — use this when you want only *part* of the
// screen to scroll (e.g. a list) while the rest stays fixed. In that case,
// give the scrolling piece its own FlatList/ScrollView with `flex: 1` so it
// fills the remaining space and scrolls independently — don't nest another
// vertical ScrollView/FlatList inside ScreenContainer's own ScrollView
// (React Native warns about this, and it doesn't behave the way you'd want
// anyway).
export default function ScreenContainer({
  children,
  header,
  scroll = true,
  style,
  contentContainerStyle,
}) {
  const theme = useTheme();
  const Content = scroll ? ScrollView : View;
  const contentProps = scroll
    ? { contentContainerStyle: [styles.content, contentContainerStyle] }
    : { style: [styles.content, { flex: 1 }, contentContainerStyle] };

  return (
    <View style={[{ flex: 1, backgroundColor: theme.colors.background }, style]}>
      {header}
      <Content {...contentProps}>{children}</Content>
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: spacing.lg,
    flexGrow: 1,
  },
});
