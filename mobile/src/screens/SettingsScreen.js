import React from 'react';
import { useAuth } from '../context/AuthContext';
import { ScreenContainer, Button, SectionHeader } from '../ui';

// Minimal starter — just Switch Account (+ Admin, for admins) for now.
// SettingsContext (src/context/SettingsContext.js) already has profile
// editing, password change, preferred categories, reminders, and theme all
// built and ready to wire in here whenever — that's the "eventually" this
// screen grows into.
export default function SettingsScreen({ navigation }) {
  const { user } = useAuth();
  const isAdmin = user?.roles?.includes('admin');

  return (
    <ScreenContainer>
      <SectionHeader>Account</SectionHeader>
      <Button variant="outline" onPress={() => navigation.navigate('SwitchAccount')}>
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
