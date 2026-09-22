import React, { useState } from 'react';
import { Alert, View } from 'react-native';
import { IconButton, useTheme } from 'react-native-paper';
import { useAuth } from '../context/AuthContext';
import { ScreenContainer, Button, SectionHeader, EmptyState, spacing } from '../ui';

export default function SwitchAccountScreen({ navigation }) {
  const { user, accounts, switchAccount, removeAccount, logout } = useAuth();
  const theme = useTheme();
  const [switching, setSwitching] = useState(null); // id currently switching to, for a loading state

  const confirmRemove = (account) => {
    Alert.alert(
      'Remove account?',
      `Forget "${account.full_name}" on this device? You'll need to log in again to use it here.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Remove', style: 'destructive', onPress: () => removeAccount(account.id) },
      ]
    );
  };

  const handleSwitch = async (accountId) => {
    if (accountId === user?.id) return; // already active
    setSwitching(accountId);
    try {
      const switchedTo = await switchAccount(accountId);
      // Not always 'Home' — an admin-only account (no 'tech' role) doesn't
      // even have that route registered (see AppStack), so it'd fail to
      // navigate. Route to whichever landing screen actually exists for
      // whichever account this just became.
      navigation.navigate(switchedTo.roles?.includes('tech') ? 'Home' : 'AdminHome');
    } catch (err) {
      // Most likely cause: this account's remembered refresh token is
      // dead (expired, revoked, or points at a backend/database that no
      // longer has it — e.g. switching servers during testing). It can't
      // be logged into instantly without a password, so offer to forget
      // it rather than leaving a permanently-broken entry in the list.
      Alert.alert(
        "Can't log in",
        "This account's saved session has expired and can't be restored automatically. Remove it from this device? You can log back into it fresh anytime from the Register/Login screen.",
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Remove Account',
            style: 'destructive',
            onPress: () => removeAccount(accountId),
          },
        ]
      );
    } finally {
      setSwitching(null);
    }
  };

  return (
    <ScreenContainer>
      <SectionHeader>Accounts on This Device</SectionHeader>
      {accounts.length === 0 ? (
        <EmptyState message="No remembered accounts." />
      ) : (
        accounts.map((account) => (
          <View key={account.id} style={{ flexDirection: 'row', alignItems: 'center', marginTop: spacing.sm }}>
            <Button
              variant={account.id === user?.id ? 'secondary' : 'outline'}
              subtitle={account.username}
              loading={switching === account.id}
              onPress={() => handleSwitch(account.id)}
              style={{ flex: 1 }}
            >
              {account.full_name}
              {account.id === user?.id ? ' (current)' : ''}
            </Button>
            <IconButton
              icon="delete-outline"
              iconColor={theme.colors.error}
              onPress={() => confirmRemove(account)}
              accessibilityLabel={`Remove ${account.full_name} from this device`}
            />
          </View>
        ))
      )}

      <SectionHeader>Add Another Account</SectionHeader>
      <Button variant="outline" onPress={logout}>
        Log Out to Add One
      </Button>
    </ScreenContainer>
  );
}
