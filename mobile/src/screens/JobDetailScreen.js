import React, { useEffect, useState } from 'react';
import { StyleSheet } from 'react-native';
import { Text, ActivityIndicator } from 'react-native-paper';
import { useAuth } from '../context/AuthContext';
import { useTracking } from '../context/TrackingContext';
import * as api from '../api/client';
import { ScreenContainer, Card, Button, SectionHeader, EmptyState } from '../ui';

export default function JobDetailScreen({ route, navigation }) {
  const { job } = route.params;
  const { accessToken } = useAuth();
  const { selectJob } = useTracking();
  const [history, setHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(true);

  useEffect(() => {
    api
      .getJobHistory(job.id, accessToken)
      .then(setHistory)
      .catch(() => setHistory([])) // offline or request failed — just show no notes rather than an error
      .finally(() => setLoadingHistory(false));
  }, [job.id, accessToken]);

  const handleTravel = async () => {
    await selectJob(job.id, 'travel');
    navigation.navigate('Home');
  };

  return (
    <ScreenContainer>
      <Text variant="labelLarge" style={styles.jobNumber}>
        {job.job_number}
      </Text>
      <Text variant="headlineSmall" style={styles.name}>
        {job.name}
      </Text>
      {job.address ? (
        <Text variant="bodyMedium" style={styles.address}>
          {job.address}
        </Text>
      ) : null}

      <Button variant="primary" onPress={handleTravel} style={styles.travelButton}>
        Travel
      </Button>

      <SectionHeader>Notes From Previous Techs</SectionHeader>
      {loadingHistory ? (
        <ActivityIndicator style={styles.loading} />
      ) : history.length === 0 ? (
        <EmptyState message="No notes from previous visits yet." />
      ) : (
        history.map((entry) => (
          <Card key={entry.id} style={styles.noteCard}>
            <Text variant="bodyMedium">{entry.visit_summary}</Text>
            <Text variant="bodySmall" style={styles.noteMeta}>
              {entry.tech_name} • {formatDate(entry.submitted_at)}
            </Text>
          </Card>
        ))
      )}
    </ScreenContainer>
  );
}

function formatDate(iso) {
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

const styles = StyleSheet.create({
  jobNumber: {
    opacity: 0.6,
    marginBottom: 4,
  },
  name: {
    fontWeight: '700',
  },
  address: {
    opacity: 0.7,
    marginTop: 4,
    marginBottom: 20,
  },
  travelButton: {
    marginBottom: 8,
  },
  loading: {
    marginTop: 12,
  },
  noteCard: {
    marginBottom: 12,
  },
  noteMeta: {
    opacity: 0.5,
    marginTop: 8,
  },
});
