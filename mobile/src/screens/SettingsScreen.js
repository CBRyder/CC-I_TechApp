import React from 'react';
import { useAuth } from '../context/AuthContext';
import { ScreenContainer, Button, SectionHeader, spacing } from '../ui';

// SettingsContext (src/context/SettingsContext.js) also has preferred
// categories, reminders, and theme built and ready to wire in here whenever.
export default function SettingsScreen({ navigation }) {
  const { user } = useAuth();
  const isAdmin = user?.roles?.includes('admin');

  return (
    <ScreenContainer>
      <SectionHeader>Account</SectionHeader>
      <Button variant="outline" onPress={() => navigation.navigate('EditProfile')}>
        Edit Profile
      </Button>
      <Button
        variant="outline"
        onPress={() => navigation.navigate('ChangePassword')}
        style={{ marginTop: spacing.sm }}
      >
        Change Password
      </Button>
      <Button
        variant="outline"
        onPress={() => navigation.navigate('SwitchAccount')}
        style={{ marginTop: spacing.sm }}
      >
        Switch Account
      </Button>

      {isAdmin && (
        <>
          <SectionHeader>Admin</SectionHeader>
          <Button variant="outline" onPress={() => navigation.navigate('AdminUsers')}>
            Users &amp; Roles
          </Button>
        </>
      )}
    </ScreenContainer>
  );
}
