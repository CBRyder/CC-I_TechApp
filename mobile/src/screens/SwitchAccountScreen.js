import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { ScreenContainer, Button, SectionHeader, EmptyState } from '../ui';

export default function SwitchAccountScreen({ navigation }) {
  const { user, accounts, switchAccount, logout } = useAuth();
  const [switching, setSwitching] = useState(null); // id currently switching to, for a loading state

  const handleSwitch = async (accountId) => {
    if (accountId === user?.id) return; // already active
    setSwitching(accountId);
    try {
      await switchAccount(accountId);
      navigation.navigate('Home');
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
          <Button
            key={account.id}
            variant={account.id === user?.id ? 'secondary' : 'outline'}
            subtitle={account.username}
            loading={switching === account.id}
            onPress={() => handleSwitch(account.id)}
            style={{ marginTop: 8, width: '100%' }}
          >
            {account.full_name}
            {account.id === user?.id ? ' (current)' : ''}
          </Button>
        ))
      )}

      <SectionHeader>Add Another Account</SectionHeader>
      <Button variant="outline" onPress={logout}>
        Log Out to Add One
      </Button>
    </ScreenContainer>
  );
}
