import React, { useMemo } from 'react';
import { FlatList, StyleSheet } from 'react-native';
import { List, Text } from 'react-native-paper';
import { useTracking } from '../../context/TrackingContext';

// Step 1 of "browse a section, then filter until found": pick a category.
export default function PartsCategoryScreen({ route, navigation }) {
  const { completionClientId } = route.params;
  const { parts } = useTracking();

  const categories = useMemo(() => {
    const counts = new Map();
    for (const part of parts) {
      counts.set(part.category, (counts.get(part.category) || 0) + 1);
    }
    return Array.from(counts.entries()).map(([category, count]) => ({ category, count }));
  }, [parts]);

  return (
    <FlatList
      data={categories}
      keyExtractor={(item) => item.category}
      contentContainerStyle={styles.list}
      renderItem={({ item }) => (
        <List.Item
          title={item.category}
          description={`${item.count} part${item.count === 1 ? '' : 's'}`}
          right={(props) => <List.Icon {...props} icon="chevron-right" />}
          onPress={() =>
            navigation.navigate('PartsList', { category: item.category, completionClientId })
          }
        />
      )}
      ListEmptyComponent={
        <Text style={styles.empty}>No parts available — try again once you're online.</Text>
      }
    />
  );
}

const styles = StyleSheet.create({
  list: { flexGrow: 1 },
  empty: { textAlign: 'center', marginTop: 32, opacity: 0.6, paddingHorizontal: 24 },
});
