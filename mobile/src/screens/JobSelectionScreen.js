import React from 'react';
import { FlatList, StyleSheet } from 'react-native';
import { List, Text } from 'react-native-paper';
import { useTracking } from '../context/TrackingContext';

export default function JobSelectionScreen({ navigation }) {
  const { jobs, selectJob } = useTracking();

  const handleSelect = async (job) => {
    await selectJob(job.id, 'travel');
    navigation.goBack();
  };

  return (
    <FlatList
      data={jobs}
      keyExtractor={(item) => String(item.id)}
      contentContainerStyle={styles.list}
      renderItem={({ item }) => (
        <List.Item
          title={item.name}
          description={`${item.job_number}${item.address ? ' • ' + item.address : ''}`}
          onPress={() => handleSelect(item)}
        />
      )}
      ListEmptyComponent={
        <Text style={styles.empty}>No open jobs available — try again once you're online.</Text>
      }
    />
  );
}

const styles = StyleSheet.create({
  list: { flexGrow: 1 },
  empty: { textAlign: 'center', marginTop: 32, opacity: 0.6, paddingHorizontal: 24 },
});
