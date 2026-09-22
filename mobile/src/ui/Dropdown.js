import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Menu, useTheme } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { spacing, radius, touchTarget } from './theme';

// options: [{ key, label, subtitle? }]. value: the currently selected
// key (or null). Visually matches TextField (label above, bordered box)
// so a form can mix text fields and dropdowns without looking inconsistent.
export default function Dropdown({ label, value, placeholder = 'Select...', options, onSelect, style }) {
  const [visible, setVisible] = useState(false);
  const theme = useTheme();
  const selected = options.find((o) => o.key === value);

  return (
    <View style={[styles.container, style]}>
      {label ? (
        <Text style={[styles.label, { color: theme.colors.onSurfaceVariant }]}>{label}</Text>
      ) : null}
      <Menu
        visible={visible}
        onDismiss={() => setVisible(false)}
        anchor={
          <Pressable
            onPress={() => setVisible(true)}
            style={[
              styles.box,
              { borderColor: theme.colors.outline, backgroundColor: theme.colors.surface },
            ]}
          >
            <Text
              style={[
                styles.value,
                { color: selected ? theme.colors.onSurface : theme.colors.onSurfaceVariant },
              ]}
              numberOfLines={1}
            >
              {selected ? selected.label : placeholder}
            </Text>
            <MaterialCommunityIcons name="chevron-down" size={20} color={theme.colors.onSurfaceVariant} />
          </Pressable>
        }
        style={{ maxWidth: '90%' }}
      >
        {options.length === 0 ? (
          <Menu.Item title="Nothing to pick from" disabled />
        ) : (
          options.map((option) => (
            <Menu.Item
              key={option.key}
              title={option.label}
              onPress={() => {
                onSelect(option.key);
                setVisible(false);
              }}
            />
          ))
        )}
      </Menu>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginBottom: spacing.md },
  label: { fontSize: 13, marginBottom: spacing.xs, fontWeight: '600' },
  box: {
    minHeight: touchTarget,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  value: { fontSize: 16, flex: 1 },
});
