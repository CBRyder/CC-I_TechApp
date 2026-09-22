import React, { useCallback, useEffect, useState } from 'react';
import { View, Alert } from 'react-native';
import { Text, ActivityIndicator } from 'react-native-paper';
import { useAuth } from '../../context/AuthContext';
import * as api from '../../api/client';
import { ScreenContainer, SectionHeader, EmptyState, Button, TextField, StatusPill, spacing } from '../../ui';

// Admin's read-mostly view of a visit — everything the tech recorded
// (notes, parts, arrival time) plus the things only an admin sets: the
// umbrella/location names and the PO number for billing.
export default function AdminVisitDetailScreen({ route }) {
  const { assignmentId } = route.params;
  const { accessToken } = useAuth();

  const [visit, setVisit] = useState(null);
  const [error, setError] = useState(null);

  const [poNumber, setPoNumber] = useState('');
  const [savingPO, setSavingPO] = useState(false);
  const [poSaved, setPoSaved] = useState(false);

  const [umbrellaName, setUmbrellaName] = useState('');
  const [locationName, setLocationName] = useState('');
  const [savingJob, setSavingJob] = useState(false);
  const [jobSaved, setJobSaved] = useState(false);

  const [reopening, setReopening] = useState(false);

  const load = useCallback(async () => {
    try {
      setError(null);
      const data = await api.getAdminVisit(assignmentId, accessToken);
      setVisit(data);
      setPoNumber(data.completion?.po_number || '');
      setUmbrellaName(data.customer_name || '');
      setLocationName(data.location_name || '');
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

  const saveJobInfo = async () => {
    setSavingJob(true);
    setJobSaved(false);
    try {
      const updated = await api.updateJob(
        visit.job_id,
        { customer_name: umbrellaName.trim(), location_name: locationName.trim() },
        accessToken
      );
      setVisit((current) => ({ ...current, ...updated }));
      setJobSaved(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setSavingJob(false);
    }
  };

  const confirmReopen = () => {
    Alert.alert(
      'Reopen this visit?',
      "It'll show as In Progress again. The notes, parts, and PO already recorded stay as they are.",
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reopen',
          onPress: async () => {
            setReopening(true);
            try {
              await api.reopenCompletion(visit.completion.id, accessToken);
              await load();
            } catch (err) {
              setError(err.message);
            } finally {
              setReopening(false);
            }
          },
        },
      ]
    );
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
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <Text variant="titleLarge" style={{ flex: 1 }}>
          {visit.job_name}
        </Text>
        <StatusPill state={visit.status} />
      </View>
      <Text variant="bodyMedium" style={{ opacity: 0.7, marginTop: spacing.xs }}>
        {visit.visit_code} · {visit.address}
      </Text>
      <Text variant="bodySmall" style={{ opacity: 0.7, marginTop: spacing.xs }}>
        {visit.assigned_to} ({visit.tech_types.join(' & ')} tech) · {new Date(visit.assigned_date).toLocaleDateString()}
      </Text>
      {visit.arrived_at && (
        <Text variant="bodySmall" style={{ opacity: 0.7 }}>
          Arrived {new Date(visit.arrived_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
        </Text>
      )}
      {visit.completion?.submitted_at && (
        <Button
          variant="outline"
          onPress={confirmReopen}
          loading={reopening}
          disabled={reopening}
          style={{ marginTop: spacing.md }}
        >
          Reopen Visit
        </Button>
      )}

      <SectionHeader>Umbrella &amp; Location</SectionHeader>
      <TextField label="Umbrella Name" value={umbrellaName} onChangeText={setUmbrellaName} placeholder="e.g. Waste Management" />
      <TextField label="Location Name" value={locationName} onChangeText={setLocationName} placeholder="e.g. Walmart" />
      <Button onPress={saveJobInfo} loading={savingJob} disabled={savingJob}>
        Save
      </Button>
      {jobSaved && <Text style={{ marginTop: spacing.sm, opacity: 0.7 }}>Saved.</Text>}

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
