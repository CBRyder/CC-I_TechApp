import React from 'react';
import { Pressable } from 'react-native';
import { Text, Avatar } from 'react-native-paper';
import { useAuth } from '../../context/AuthContext';
import { ScreenContainer, Button, SectionHeader, spacing } from '../../ui';

// Landing screen for admin-only accounts (holding 'admin' but not 'tech') —
// the regular Home screen is entirely clock-in/job-tracking UI that means
// nothing without the tech role, so admin-only accounts never even see
// those routes (see AppStack's isTech gating). Also reachable as a plain
// destination (not the landing screen) for tech+admin accounts, via the
// "Admin" button on the regular Home — one shared hub for every admin
// feature instead of scattering entry points across the app.
export default function AdminHomeScreen({ navigation }) {
  const { user, logout } = useAuth();

  return (
    <ScreenContainer>
      <Pressable onPress={() => navigation.navigate('SwitchAccount')}>
        <Avatar.Text size={64} label={initials(user?.full_name)} />
      </Pressable>
      <Text variant="headlineSmall" style={{ marginTop: spacing.md }}>
        Hi, {user?.full_name}
      </Text>
      <Text variant="bodyMedium" style={{ opacity: 0.7, marginTop: spacing.xs }}>
        Admin
      </Text>

      <SectionHeader>Admin</SectionHeader>
      <Button onPress={() => navigation.navigate('AdminUsers')} style={{ width: '100%' }}>
        Users &amp; Roles
      </Button>
      <Button
        onPress={() => navigation.navigate('AdminVisits')}
        style={{ marginTop: spacing.sm, width: '100%' }}
      >
        Completed Jobs
      </Button>
          
      <Button
        variant="text"
        onPress={logout}
        style={{ width: '100%' }}
      >
        Log Out
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
