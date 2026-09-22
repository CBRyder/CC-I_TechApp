import React, { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../../context/AuthContext';
import * as api from '../../api/client';
import { ScreenContainer, SectionHeader, Button, TextField, ListRow, spacing } from '../../ui';
import { Text, useTheme } from 'react-native-paper';

// job_number suggestions are purely a convenience default — admin can
// always override. Looks at existing numbers sharing the highest-numbered
// prefix (e.g. "J-1003" -> suggests "J-1004"); falls back to "J-1001" if
// nothing parses.
function suggestNextJobNumber(jobs) {
  let best = { prefix: 'J-', number: 1000 };
  for (const job of jobs) {
    const match = /^(.*?)(\d+)$/.exec(job.job_number || '');
    if (!match) continue;
    const number = parseInt(match[2], 10);
    if (number > best.number) best = { prefix: match[1], number };
  }
  return `${best.prefix}${best.number + 1}`;
}

export default function AdminCreateJobScreen({ navigation }) {
  const { accessToken } = useAuth();
  const theme = useTheme();

  const [customers, setCustomers] = useState([]);
  const [selectedCustomer, setSelectedCustomer] = useState(null);

  const [jobNumber, setJobNumber] = useState('');
  const [jobNumberTouched, setJobNumberTouched] = useState(false);
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [locationName, setLocationName] = useState('');
  const [totalVisits, setTotalVisits] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  // Refetches every time this screen regains focus — covers coming back
  // from "+ New Customer" with the new one now in the list.
  useFocusEffect(
    useCallback(() => {
      api.listCustomers(accessToken).then(setCustomers).catch(() => {});
      if (!jobNumberTouched) {
        api
          .listJobs(accessToken)
          .then((jobs) => setJobNumber(suggestNextJobNumber(jobs)))
          .catch(() => {});
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [accessToken])
  );

  const handleCreate = async () => {
    if (!jobNumber.trim() || !name.trim()) {
      setError('Job number and name are required.');
      return;
    }
    const parsedTotalVisits = totalVisits.trim() ? parseInt(totalVisits.trim(), 10) : undefined;
    if (totalVisits.trim() && !Number.isInteger(parsedTotalVisits)) {
      setError('Total visits must be a whole number.');
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      await api.createJob(
        {
          job_number: jobNumber.trim(),
          name: name.trim(),
          address: address.trim() || undefined,
          customer_name: selectedCustomer?.name,
          location_name: locationName.trim() || undefined,
          total_visits: parsedTotalVisits,
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
      <SectionHeader>Customer (Umbrella)</SectionHeader>
      {customers.map((customer) => (
        <ListRow
          key={customer.id}
          title={customer.name}
          subtitle={customer.contact_name || undefined}
          onPress={() => setSelectedCustomer(customer)}
          trailing={
            selectedCustomer?.id === customer.id ? (
              <Text style={{ color: theme.colors.primary, fontWeight: '700' }}>Selected</Text>
            ) : null
          }
        />
      ))}
      <Button
        variant="text"
        onPress={() => navigation.navigate('AdminCreateCustomer')}
        style={{ marginTop: spacing.sm }}
      >
        + New Customer
      </Button>

      <SectionHeader>Job Details</SectionHeader>
      <TextField
        label="Job Number"
        value={jobNumber}
        onChangeText={(v) => {
          setJobNumber(v);
          setJobNumberTouched(true);
        }}
        autoCapitalize="characters"
      />
      <TextField label="Job Name" value={name} onChangeText={setName} placeholder="e.g. Trash Compactor Service" />
      <TextField label="Location Name (optional)" value={locationName} onChangeText={setLocationName} placeholder="e.g. Walmart #4521" />
      <TextField label="Address (optional)" value={address} onChangeText={setAddress} />
      <TextField
        label="Total Visits (optional)"
        value={totalVisits}
        onChangeText={setTotalVisits}
        keyboardType="number-pad"
        placeholder="e.g. 12 for a recurring contract"
      />

      {error ? (
        <Text style={{ color: theme.colors.error, marginBottom: spacing.sm }}>{error}</Text>
      ) : null}

      <Button onPress={handleCreate} loading={submitting} disabled={submitting}>
        Create Job
      </Button>
    </ScreenContainer>
  );
}
