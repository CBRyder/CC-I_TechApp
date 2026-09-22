import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import * as api from '../../api/client';
import { ScreenContainer, SectionHeader, Button, TextField, spacing } from '../../ui';
import { Text, useTheme } from 'react-native-paper';

export default function AdminCreateCustomerScreen({ navigation, route }) {
  const { accessToken } = useAuth();
  const theme = useTheme();
  const [name, setName] = useState('');
  const [contactName, setContactName] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  // Opened either standalone from the admin hub, or from Create Job's
  // customer picker ("+ New Customer") — either way, just go back on
  // success; Create Job refetches its customer list on focus, so the new
  // one shows up there automatically.
  const handleCreate = async () => {
    if (!name.trim()) {
      setError('Name is required.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await api.createCustomer(
        {
          name: name.trim(),
          contact_name: contactName.trim() || undefined,
          contact_phone: contactPhone.trim() || undefined,
          contact_email: contactEmail.trim() || undefined,
          notes: notes.trim() || undefined,
        },
        accessToken
      );
      navigation.goBack();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ScreenContainer>
      <SectionHeader>New Customer</SectionHeader>
      <TextField label="Name" value={name} onChangeText={setName} placeholder="e.g. Waste Management" />
      <TextField label="Contact Name (optional)" value={contactName} onChangeText={setContactName} />
      <TextField
        label="Contact Phone (optional)"
        value={contactPhone}
        onChangeText={setContactPhone}
        keyboardType="phone-pad"
      />
      <TextField
        label="Contact Email (optional)"
        value={contactEmail}
        onChangeText={setContactEmail}
        autoCapitalize="none"
        keyboardType="email-address"
      />
      <TextField label="Notes (optional)" value={notes} onChangeText={setNotes} multiline />

      {error ? (
        <Text style={{ color: theme.colors.error, marginBottom: spacing.sm }}>{error}</Text>
      ) : null}

      <Button onPress={handleCreate} loading={submitting} disabled={submitting}>
        Create Customer
      </Button>
    </ScreenContainer>
  );
}
