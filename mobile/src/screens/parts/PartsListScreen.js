import React, { useMemo, useState } from 'react';
import { FlatList, StyleSheet, View } from 'react-native';
import { Searchbar, List, Text } from 'react-native-paper';
import { useTracking } from '../../context/TrackingContext';

// Step 2: filter within that category until the tech finds the part they
// used, then tap it to add — one tap, done, back on the completion screen.
export default function PartsListScreen({ route, navigation }) {
  const { category, completionClientId } = route.params;
  const { parts, addPartToCompletion } = useTracking();
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const inCategory = parts.filter((p) => p.category === category);
    const q = query.trim().toLowerCase();
    if (!q) return inCategory;
    return inCategory.filter((p) => p.name.toLowerCase().includes(q));
  }, [parts, category, query]);

  const handleSelect = async (part) => {
    await addPartToCompletion(completionClientId, part.id, 1);
    navigation.navigate('CompleteJob', { completionClientId });
  };

  return (
    <View style={styles.container}>
      <Searchbar
        placeholder={`Filter ${category}`}
        value={query}
        onChangeText={setQuery}
        style={styles.search}
      />
      <FlatList
        data={filtered}
        keyExtractor={(item) => String(item.id)}
        renderItem={({ item }) => (
          <List.Item title={item.name} description={item.unit} onPress={() => handleSelect(item)} />
        )}
        ListEmptyComponent={<Text style={styles.empty}>No matching parts.</Text>}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  search: { margin: 12 },
  empty: { textAlign: 'center', marginTop: 32, opacity: 0.6, paddingHorizontal: 24 },
});
