import React, { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import { Text, ActivityIndicator } from 'react-native-paper';
import { useAuth } from '../../context/AuthContext';
import * as api from '../../api/client';
import { ScreenContainer, SectionHeader, EmptyState, Button, TextField, spacing } from '../../ui';

// Admin's read-mostly view of a completed visit — everything the tech
// recorded (notes, parts) plus the one thing only an admin sets: the PO
// number for billing.
export default function AdminVisitDetailScreen({ route }) {
  const { assignmentId } = route.params;
  const { accessToken } = useAuth();

  const [visit, setVisit] = useState(null);
  const [error, setError] = useState(null);
  const [poNumber, setPoNumber] = useState('');
  const [savingPO, setSavingPO] = useState(false);
  const [poSaved, setPoSaved] = useState(false);

  const load = useCallback(async () => {
    try {
      setError(null);
      const data = await api.getAdminVisit(assignmentId, accessToken);
      setVisit(data);
      setPoNumber(data.completion?.po_number || '');
    } catch (err) {
      setError(err.message);
    }
  }, [assignmentId, accessToken]);

  useEffect(() => {
    load();
  }, [load]);

  const savePO = async () => {
    if (!visit?.completion) return;
    setSavingPO(true);
    setPoSaved(false);
    try {
      await api.setCompletionPO(visit.completion.id, poNumber.trim(), accessToken);
      setPoSaved(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setSavingPO(false);
    }
  };

  if (error) {
    return (
      <ScreenContainer>
        <EmptyState message={`Couldn't load visit: ${error}`} />
      </ScreenContainer>
    );
  }

  if (!visit) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <ScreenContainer>
      <Text variant="titleLarge">{visit.job_name}</Text>
      <Text variant="bodyMedium" style={{ opacity: 0.7 }}>
        {visit.visit_code} · {visit.customer_name || visit.address}
      </Text>
      <Text variant="bodySmall" style={{ opacity: 0.7, marginTop: spacing.xs }}>
        {visit.assigned_to} · {new Date(visit.assigned_date).toLocaleDateString()}
      </Text>

      <SectionHeader>Purchase Order</SectionHeader>
      {visit.completion ? (
        <>
          <TextField
            label="PO Number"
            value={poNumber}
            onChangeText={setPoNumber}
            placeholder="e.g. PO-4521"
            autoCapitalize="characters"
          />
          <Button onPress={savePO} loading={savingPO} disabled={savingPO}>
            Save PO
          </Button>
          {poSaved && (
            <Text style={{ marginTop: spacing.sm, opacity: 0.7 }}>Saved.</Text>
          )}
        </>
      ) : (
        <EmptyState message="This visit has no submitted completion yet." />
      )}

      <SectionHeader>Notes</SectionHeader>
      <Text>{visit.completion?.visit_summary || 'No notes were left for this visit.'}</Text>

      <SectionHeader>Parts Used</SectionHeader>
      {visit.parts.length === 0 ? (
        <EmptyState message="No parts were logged for this visit." />
      ) : (
        visit.parts.map((part) => (
          <Text key={part.id}>
            {part.quantity}x {part.name} ({part.unit})
          </Text>
        ))
      )}
    </ScreenContainer>
  );
}
