import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Text, useTheme } from 'react-native-paper';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../../context/AuthContext';
import * as api from '../../api/client';
import {
  ScreenContainer,
  SegmentedTabs,
  SearchField,
  SectionHeader,
  ListRow,
  EmptyState,
  FAB,
  spacing,
} from '../../ui';
import { money } from './format';

const FILTERS = ['Active', 'Hidden'];

// The parts catalog itself — every part's name, category, unit, and sell
// price (the "price list"), as opposed to Stock Levels, which is about how
// many are on the shelf. Tap a part to edit it; + adds a new one.
export default function InventoryListScreen({ navigation }) {
  const { accessToken } = useAuth();
  const theme = useTheme();
  const [parts, setParts] = useState(null);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState(FILTERS[0]);
  const [query, setQuery] = useState('');

  const load = useCallback(async () => {
    setError(null);
    try {
      setParts(await api.getInventoryParts(accessToken));
    } catch (err) {
      setError(err.message);
    }
  }, [accessToken]);

  // Reload on return — an edit or a newly added part should show up here.
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const groups = useMemo(() => {
    if (!parts) return [];
    const q = query.trim().toLowerCase();
    const wantStatus = filter === 'Active' ? 'active' : 'inactive';
    const byCategory = new Map();
    for (const p of parts) {
      if (p.status !== wantStatus) continue;
      if (q && !p.name.toLowerCase().includes(q) && !p.category.toLowerCase().includes(q)) continue;
      if (!byCategory.has(p.category)) byCategory.set(p.category, []);
      byCategory.get(p.category).push(p);
    }
    return [...byCategory];
  }, [parts, filter, query]);

  const unpriced = parts ? parts.filter((p) => p.status === 'active' && p.sell_price == null).length : 0;

  return (
    <View style={{ flex: 1 }}>
      <ScreenContainer>
        <SegmentedTabs options={FILTERS} value={filter} onChange={setFilter} />
        <SearchField
          value={query}
          onChangeText={setQuery}
          placeholder="Search by name or category"
          style={{ marginTop: spacing.md }}
        />
        {parts && unpriced > 0 && filter === 'Active' ? (
          <Text style={{ color: theme.colors.onSurfaceVariant, marginTop: spacing.sm }}>
            {unpriced} {unpriced === 1 ? 'part has' : 'parts have'} no sell price yet.
          </Text>
        ) : null}

        {error ? (
          <EmptyState message={`Couldn't load the inventory list: ${error}`} />
        ) : !parts ? (
          <View style={{ paddingTop: 40, alignItems: 'center' }}>
            <ActivityIndicator size="large" />
          </View>
        ) : groups.length === 0 ? (
          <EmptyState
            message={filter === 'Hidden' ? 'No hidden parts.' : query ? 'No parts match.' : 'No parts yet. Tap + to add one.'}
          />
        ) : (
          groups.map(([category, items]) => (
            <View key={category}>
              <SectionHeader>{`${category} (${items.length})`}</SectionHeader>
              {items.map((part) => (
                <ListRow
                  key={part.id}
                  title={part.name}
                  subtitle={`per ${part.unit}`}
                  onPress={() => navigation.navigate('InventoryPart', { partId: part.id })}
                  trailing={
                    <Text
                      style={{
                        fontSize: 16,
                        fontWeight: '700',
                        color: part.sell_price == null ? theme.colors.onSurfaceVariant : theme.colors.onSurface,
                      }}
                    >
                      {part.sell_price == null ? 'No price' : money(part.sell_price)}
                    </Text>
                  }
                />
              ))}
            </View>
          ))
        )}
        {/* room so the last row isn't hidden under the + button */}
        <View style={{ height: 80 }} />
      </ScreenContainer>
      <FAB onPress={() => navigation.navigate('InventoryPart', { partId: null })} />
    </View>
  );
}
