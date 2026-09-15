import React from 'react';
import { FlatList, StyleSheet } from 'react-native';
import { useTheme } from 'react-native-paper';
import { useTracking } from '../context/TrackingContext';
import { JobCard, EmptyState } from '../ui';

export default function JobSelectionScreen({ navigation }) {
  const { jobs, selectJob } = useTracking();

  const handleSelect = async (job) => {
    navigation.navigation('JobDetail', { job });
  };

  const theme = useTheme();

  return (
    <FlatList
      style={{ backgroundColor: theme.colors.background }}
      data={jobs}
      keyExtractor={(item) => String(item.id)}
      contentContainerStyle={styles.list}
      renderItem={({ item }) => (
        <JobCard
          job={item}
          onPress={() => handleSelect(item)}
        />
      )}
      ListEmptyComponent={
        <EmptyState message="No open kobs available - try again once you're online." />
      }
    />
  );
}

const styles = StyleSheet.create({
  greeting: {
    marginTop: 16,
  },
  list: {
    flexGrow: 1
  },
  empty: {
    textAlign: 'center', marginTop: 32, opacity: 0.6, paddingHorizontal: 24
  },
  subtitle: {
    marginTop: 8,
    marginBottom: 16,
    opacity: 0.7,
    textAlign: 'center',
  },
  muted: {
    opacity: 0.6,
    marginTop: 4,
    marginBottom: 12,
  },
  primaryButton: {
    marginTop: 8,
    width: '100%',
  },
  secondaryButton: {
    marginTop: 12,
    width: '100%',
  },
  jobCard: {
    marginTop: 16,
    width: '100%',
  },
  cardButton: {
    marginTop: 12,
  },
  pendingCard: {
    marginTop: 24,
    width: '100%',
  },
  pendingButton: {
    marginTop: 8,
  },
  logoutButton: {
    marginTop: 32,
  },
});

