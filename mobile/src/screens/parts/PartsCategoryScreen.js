import React, { useMemo } from 'react';
import { FlatList, StyleSheet } from 'react-native';
import { List, Text } from 'react-native-paper';
import { useTracking } from '../../context/TrackingContext';
import { useSettings } from '../../context/SettingsContext';

// Step 1 of "browse a section, then filter until found": pick a category.
// A tech's preferred categories (Settings) sort to the top so their usual
// trade's parts are one tap closer instead of buried alphabetically.
export default function PartsCategoryScreen({ route, navigation }) {
  const { completionClientId } = route.params;
  const { parts } = useTracking();
  const { preferredCategories } = useSettings();

  const categories = useMemo(() => {
    const counts = new Map();
    for (const part of parts) {
      counts.set(part.category, (counts.get(part.category) || 0) + 1);
    }
    const all = Array.from(counts.entries()).map(([category, count]) => ({ category, count }));
    return all.sort((a, b) => {
      const aPreferred = preferredCategories.includes(a.category);
      const bPreferred = preferredCategories.includes(b.category);
      if (aPreferred === bPreferred) return a.category.localeCompare(b.category);
      return aPreferred ? -1 : 1;
    });
  }, [parts, preferredCategories]);

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
