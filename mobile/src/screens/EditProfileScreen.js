import React, { useState } from 'react';
import { Text, useTheme } from 'react-native-paper';
import { useAuth } from '../context/AuthContext';
import { useSettings } from '../context/SettingsContext';
import { ScreenContainer, Button, TextField, spacing } from '../ui';

export default function EditProfileScreen() {
  const theme = useTheme();
  const { user } = useAuth();
  const { updateProfile } = useSettings();
  const [fullName, setFullName] = useState(user?.full_name || '');
  const [phone, setPhone] = useState(user?.phone || '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState(null);

  const save = async () => {
    if (!fullName.trim()) {
      setError('Full name is required.');
      return;
    }
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      await updateProfile({ full_name: fullName.trim(), phone: phone.trim() });
      setSaved(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScreenContainer>
      <TextField label="Full Name" value={fullName} onChangeText={setFullName} />
      <TextField label="Phone" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />

      {error ? (
        <Text style={{ color: theme.colors.error, fontSize: 13, marginBottom: spacing.sm }}>{error}</Text>
      ) : null}

      <Button onPress={save} loading={saving} disabled={saving}>
        Save
      </Button>
      {saved && <Text style={{ marginTop: spacing.sm, opacity: 0.7 }}>Saved.</Text>}
    </ScreenContainer>
  );
}
