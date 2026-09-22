import React, { useState, useRef, useEffect } from 'react';
import { Alert, View } from 'react-native';
import { IconButton, Text, useTheme } from 'react-native-paper';
import { useAuth } from '../context/AuthContext';
import { ScreenContainer, Button, SectionHeader, EmptyState, spacing } from '../ui';

export default function SwitchAccountScreen({ navigation }) {
  const { user, accounts, switchAccount, removeAccount, logout } = useAuth();
  const theme = useTheme();
  const [switching, setSwitching] = useState(null); // id currently switching to, for a loading state

  // Which account id we're waiting to land on post-switch, if any. Navigating
  // straight after switchAccount() resolves races AppStack's own re-render —
  // it conditionally registers screens (Home only for tech, AdminHome only
  // for admin-only) based on `user`, and setUser() inside switchAccount
  // hasn't necessarily been reflected in AppStack's tree yet at that point
  // in the same tick, so acting on it too early can target a screen that
  // isn't registered yet. Instead, record the target and act from an effect
  // keyed on `user` — effects run after the commit, so by the time this
  // fires, AppStack has already re-rendered with the right screens.
  const pendingLandingRef = useRef(null);

  useEffect(() => {
    if (pendingLandingRef.current !== null && user?.id === pendingLandingRef.current) {
      pendingLandingRef.current = null;
      // reset(), not navigate() — navigate() only collapses back to an
      // existing screen if one's already on THIS stack; switching accounts
      // (especially across tech <-> admin-only, whose screen sets differ
      // entirely) usually means it isn't, so it'd get pushed on top instead,
      // leaving the previous account's screens reachable via the back
      // button underneath. reset() wipes the whole history and starts over
      // with just the landing screen, every time, regardless of role.
      navigation.reset({
        index: 0,
        routes: [{ name: user.roles?.includes('tech') ? 'Home' : 'AdminHome' }],
      });
    }
  }, [user, navigation]);

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
      await switchAccount(accountId);
      pendingLandingRef.current = accountId;
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

      <Text
        variant="bodySmall"
        style={{ opacity: 0.6, marginTop: spacing.lg, marginBottom: spacing.xs }}
      >
        To add an account, return to the login screen.
      </Text>
      <Button variant="outline" onPress={logout}>
        Return to Login Screen
      </Button>
    </ScreenContainer>
  );
}
