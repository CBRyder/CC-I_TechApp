import React from 'react';
import { useAuth } from '../context/AuthContext';
import { ScreenContainer, Button, SectionHeader } from '../ui';

// SettingsContext (src/context/SettingsContext.js) also has preferred
// categories, reminders, and theme built and ready to wire in here whenever.
// Edit Profile / Change Password live on the Switch Account screen, under
// "Edit This Account" — that's also where you land to manage/switch between
// other accounts, so account-editing and account-switching stay together.
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
