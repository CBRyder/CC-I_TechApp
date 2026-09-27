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
  StatusPill,
  FAB,
  spacing,
} from '../../ui';
import { money } from './format';

const TABS = ['Stock', 'Purchase Orders'];
const STOCK_FILTERS = ['All', 'Low Stock', 'Inactive'];
const PO_FILTERS = ['Open', 'Received', 'Cancelled'];

// Inventory hub for admins and supervisors: stock levels + sell prices on
// one tab, supplier purchase orders on the other. Parts and POs each open
// their own detail screen; the + button adds whichever the tab is showing.
export default function InventoryScreen({ navigation }) {
  const { accessToken } = useAuth();
  const [tab, setTab] = useState(TABS[0]);
  const [stockFilter, setStockFilter] = useState(STOCK_FILTERS[0]);
  const [poFilter, setPoFilter] = useState(PO_FILTERS[0]);
  const [query, setQuery] = useState('');
  const [parts, setParts] = useState(null);
  const [orders, setOrders] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [p, o] = await Promise.all([
        api.getInventoryParts(accessToken),
        api.getPurchaseOrders(null, accessToken),
      ]);
      setParts(p);
      setOrders(o);
    } catch (err) {
      setError(err.message);
    }
  }, [accessToken]);

  // Reload on every return — an edit, count, or received PO elsewhere
  // changes what this list should show.
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const lowCount = parts ? parts.filter((p) => p.status === 'active' && p.is_low).length : 0;

  return (
    <View style={{ flex: 1 }}>
      <ScreenContainer>
        <SegmentedTabs options={TABS} value={tab} onChange={setTab} />
        {error ? (
          <EmptyState message={`Couldn't load inventory: ${error}`} />
        ) : !parts || !orders ? (
          <View style={{ paddingTop: 40, alignItems: 'center' }}>
            <ActivityIndicator size="large" />
          </View>
        ) : tab === 'Stock' ? (
          <StockList
            parts={parts}
            filter={stockFilter}
            onFilter={setStockFilter}
            query={query}
            onQuery={setQuery}
            lowCount={lowCount}
            onOpen={(part) => navigation.navigate('InventoryPart', { partId: part.id })}
          />
        ) : (
          <OrderList
            orders={orders}
            filter={poFilter}
            onFilter={setPoFilter}
            onOpen={(po) => navigation.navigate('PurchaseOrder', { poId: po.id })}
          />
        )}
      </ScreenContainer>
      <FAB
        onPress={() =>
          tab === 'Stock'
            ? navigation.navigate('InventoryPart', { partId: null })
            : navigation.navigate('PurchaseOrder', { poId: null })
        }
      />
    </View>
  );
}

function StockList({ parts, filter, onFilter, query, onQuery, lowCount, onOpen }) {
  const theme = useTheme();

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const shown = parts.filter((p) => {
      if (filter === 'Inactive' ? p.status !== 'inactive' : p.status !== 'active') return false;
      if (filter === 'Low Stock' && !p.is_low) return false;
      return !q || p.name.toLowerCase().includes(q) || p.category.toLowerCase().includes(q);
    });
    const byCategory = new Map();
    for (const p of shown) {
      if (!byCategory.has(p.category)) byCategory.set(p.category, []);
      byCategory.get(p.category).push(p);
    }
    return [...byCategory];
  }, [parts, filter, query]);

  return (
    <View>
      <SegmentedTabs
        options={STOCK_FILTERS}
        value={filter}
        onChange={onFilter}
        style={{ marginTop: spacing.md }}
      />
      {lowCount > 0 && filter !== 'Low Stock' ? (
        <Text
          onPress={() => onFilter('Low Stock')}
          style={{ color: theme.colors.error, marginTop: spacing.sm, fontWeight: '600' }}
        >
          {lowCount} {lowCount === 1 ? 'part is' : 'parts are'} at or below the low-stock level — tap to see
        </Text>
      ) : null}
      <SearchField
        value={query}
        onChangeText={onQuery}
        placeholder="Search parts"
        style={{ marginTop: spacing.md }}
      />
      {groups.length === 0 ? (
        <EmptyState message={filter === 'Low Stock' ? 'Nothing is low on stock.' : 'No parts match.'} />
      ) : (
        groups.map(([category, items]) => (
          <View key={category}>
            <SectionHeader>{category}</SectionHeader>
            {items.map((part) => {
              const warn = part.is_low || part.qty_on_hand < 0;
              const details = [part.sell_price == null ? 'No price' : `${money(part.sell_price)} / ${part.unit}`];
              if (part.qty_on_order) details.push(`${part.qty_on_order} on order`);
              return (
                <ListRow
                  key={part.id}
                  title={part.name}
                  subtitle={details.join(' · ')}
                  onPress={() => onOpen(part)}
                  trailing={
                    <View style={{ alignItems: 'flex-end' }}>
                      <Text
                        style={{
                          fontSize: 18,
                          fontWeight: '700',
                          color: warn ? theme.colors.error : theme.colors.onSurface,
                        }}
                      >
                        {part.qty_on_hand}
                      </Text>
                      <Text style={{ fontSize: 11, color: theme.colors.onSurfaceVariant }}>
                        {warn ? 'LOW' : 'in stock'}
                      </Text>
                    </View>
                  }
                />
              );
            })}
          </View>
        ))
      )}
      {/* room so the last row isn't hidden under the + button */}
      <View style={{ height: 80 }} />
    </View>
  );
}

function OrderList({ orders, filter, onFilter, onOpen }) {
  const shown = orders.filter((o) =>
    filter === 'Open' ? ['draft', 'ordered'].includes(o.status) : o.status === filter.toLowerCase()
  );
  return (
    <View>
      <SegmentedTabs
        options={PO_FILTERS}
        value={filter}
        onChange={onFilter}
        style={{ marginTop: spacing.md, marginBottom: spacing.sm }}
      />
      {shown.length === 0 ? (
        <EmptyState
          message={filter === 'Open' ? 'No open purchase orders. Tap + to start one.' : 'None yet.'}
        />
      ) : (
        shown.map((po) => (
          <ListRow
            key={po.id}
            title={`${po.po_number} · ${po.vendor}`}
            subtitle={`${po.item_count} ${po.item_count === 1 ? 'part' : 'parts'}, ${po.total_quantity} total · ${new Date(
              po.created_at
            ).toLocaleDateString()}`}
            onPress={() => onOpen(po)}
            trailing={<StatusPill state={po.status} />}
          />
        ))
      )}
      <View style={{ height: 80 }} />
    </View>
  );
}
