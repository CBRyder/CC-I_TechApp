import React from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { useTheme } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';

// Floating action button — `position: absolute`, so it needs a non-scrolling
// parent to anchor to. Put it as a sibling *outside* ScreenContainer's
// ScrollView (e.g. both inside one wrapping `<View style={{ flex: 1 }}>`),
// not inside the scrollable content, or it'll scroll away with the list.
export default function FAB({ onPress, icon = 'plus', style }) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.fab, { backgroundColor: theme.colors.primary }, pressed && { opacity: 0.85 }, style]}
    >
      <MaterialCommunityIcons name={icon} size={28} color="#FFFFFF" />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
});
