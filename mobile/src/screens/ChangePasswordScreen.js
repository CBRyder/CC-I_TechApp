import React, { useState } from 'react';
import { Text, useTheme } from 'react-native-paper';
import { useSettings } from '../context/SettingsContext';
import { ScreenContainer, Button, TextField, spacing } from '../ui';

export default function ChangePasswordScreen({ navigation }) {
  const theme = useTheme();
  const { changePassword } = useSettings();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const save = async () => {
    if (newPassword.length < 8) {
      setError('New password must be at least 8 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('New password and confirmation do not match.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await changePassword(currentPassword, newPassword);
      navigation.goBack();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScreenContainer>
      <TextField
        label="Current Password"
        value={currentPassword}
        onChangeText={setCurrentPassword}
        secureTextEntry
      />
      <TextField label="New Password" value={newPassword} onChangeText={setNewPassword} secureTextEntry />
      <TextField
        label="Confirm New Password"
        value={confirmPassword}
        onChangeText={setConfirmPassword}
        secureTextEntry
      />

      {error ? (
        <Text style={{ color: theme.colors.error, fontSize: 13, marginBottom: spacing.sm }}>{error}</Text>
      ) : null}

      <Button onPress={save} loading={saving} disabled={saving}>
        Change Password
      </Button>
    </ScreenContainer>
  );
}
