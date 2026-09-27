import React from 'react';
import { Pressable } from 'react-native';
import { Text, Avatar } from 'react-native-paper';
import { useAuth } from '../../context/AuthContext';
import { ScreenContainer, Button, SectionHeader, spacing } from '../../ui';

// Supervisor hub — same pattern as AdminHome: the landing screen for a
// supervisor-only account (no tech role, no admin role), and a plain
// destination for anyone else holding 'supervisor', via the "Supervisor"
// button on Home. One place for every supervisor feature.
export default function SupervisorHomeScreen({ navigation }) {
  const { user } = useAuth();

  return (
    <ScreenContainer>
      <Pressable onPress={() => navigation.navigate('SwitchAccount')}>
        <Avatar.Text size={64} label={initials(user?.full_name)} />
      </Pressable>
      <Text variant="headlineSmall" style={{ marginTop: spacing.md }}>
        Hi, {user?.full_name}
      </Text>
      <Text variant="bodyMedium" style={{ opacity: 0.7, marginTop: spacing.xs }}>
        Supervisor
      </Text>

      <SectionHeader>Shop Inventory</SectionHeader>
      <Button
        onPress={() => navigation.navigate('Inventory', { tab: 'Stock' })}
        style={{ width: '100%' }}
      >
        Stock Levels
      </Button>
      <Button
        onPress={() => navigation.navigate('InventoryList')}
        style={{ marginTop: spacing.sm, width: '100%' }}
      >
        Inventory List
      </Button>
      <Button
        onPress={() => navigation.navigate('Inventory', { tab: 'Purchase Orders' })}
        style={{ marginTop: spacing.sm, width: '100%' }}
      >
        Purchase Orders
      </Button>
      <Button
        variant="outline"
        onPress={() => navigation.navigate('PurchaseOrder', { poId: null })}
        style={{ marginTop: spacing.sm, width: '100%' }}
      >
        New Purchase Order
      </Button>
    </ScreenContainer>
  );
}

function initials(name) {
  if (!name) return '?';
  return name
    .split(' ')
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}
