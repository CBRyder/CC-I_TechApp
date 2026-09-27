import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, View } from 'react-native';
import { IconButton, Text, useTheme } from 'react-native-paper';
import { useAuth } from '../../context/AuthContext';
import * as api from '../../api/client';
import {
  Button,
  Card,
  ScreenContainer,
  SectionHeader,
  TextField,
  SearchField,
  ListRow,
  EmptyState,
  StatusPill,
  spacing,
} from '../../ui';

function fmtDate(iso) {
  return iso ? new Date(iso).toLocaleDateString() : null;
}

// A supplier purchase order. Draft → editable (vendor, notes, parts +
// quantities). Ordered → locked; "Mark Received" adds every line to stock.
// Received/cancelled → read-only record. With poId null it starts a new draft.
export default function PurchaseOrderScreen({ route, navigation }) {
  const { poId: initialPoId } = route.params;
  const { accessToken } = useAuth();
  const theme = useTheme();

  const [poId, setPoId] = useState(initialPoId);
  const [po, setPo] = useState(null);
  const [catalog, setCatalog] = useState([]);
  const [vendor, setVendor] = useState('');
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState([]); // [{ part_id, name, unit, category, quantity: string }]
  const [picking, setPicking] = useState(false);
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const parts = await api.getInventoryParts(accessToken);
      setCatalog(parts.filter((p) => p.status === 'active'));
      if (poId == null) {
        navigation.setOptions({ title: 'New Purchase Order' });
        return;
      }
      const data = await api.getPurchaseOrder(poId, accessToken);
      setPo(data);
      setVendor(data.vendor);
      setNotes(data.notes || '');
      setItems(data.items.map((i) => ({ ...i, quantity: String(i.quantity) })));
      navigation.setOptions({ title: data.po_number });
    } catch (err) {
      setError(err.message);
    }
  }, [poId, accessToken, navigation]);

  useEffect(() => {
    load();
  }, [load]);

  const editable = poId == null || po?.status === 'draft';

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    const chosen = new Set(items.map((i) => i.part_id));
    return catalog
      .filter((p) => !chosen.has(p.id))
      .filter((p) => !q || p.name.toLowerCase().includes(q) || p.category.toLowerCase().includes(q))
      .slice(0, 25);
  }, [catalog, items, query]);

  const addItem = (part) => {
    // Suggest enough to get back above the low-stock level, else 1.
    const suggested =
      part.low_stock_level != null
        ? Math.max(1, part.low_stock_level - part.qty_on_hand - part.qty_on_order + 1)
        : 1;
    setItems((cur) => [
      ...cur,
      { part_id: part.id, name: part.name, unit: part.unit, category: part.category, quantity: String(suggested) },
    ]);
    setQuery('');
    setPicking(false);
  };

  const setQty = (partId, quantity) =>
    setItems((cur) => cur.map((i) => (i.part_id === partId ? { ...i, quantity } : i)));

  const removeItem = (partId) => setItems((cur) => cur.filter((i) => i.part_id !== partId));

  const payload = () => ({
    vendor,
    notes,
    items: items.map((i) => ({ part_id: i.part_id, quantity: Number(i.quantity) })),
  });

  // Saves the draft; returns the saved PO (or null if it failed).
  const saveDraft = async () => {
    try {
      const saved =
        poId == null
          ? await api.createPurchaseOrder(payload(), accessToken)
          : await api.updatePurchaseOrder(poId, payload(), accessToken);
      setPo(saved);
      if (poId == null) setPoId(saved.id);
      navigation.setOptions({ title: saved.po_number });
      return saved;
    } catch (err) {
      Alert.alert("Couldn't save purchase order", err.message);
      return null;
    }
  };

  const run = async (fn) => {
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  };

  const onSave = () =>
    run(async () => {
      if (await saveDraft()) Alert.alert('Saved', 'Draft saved.');
    });

  const changeStatus = async (id, action) => {
    try {
      const updated = await api.setPurchaseOrderStatus(id, action, accessToken);
      setPo(updated);
      setItems(updated.items.map((i) => ({ ...i, quantity: String(i.quantity) })));
      return updated;
    } catch (err) {
      Alert.alert("Couldn't update purchase order", err.message);
      return null;
    }
  };

  const onMarkOrdered = () =>
    Alert.alert('Mark as ordered?', 'Use this once the order has been sent to the vendor. After this, the parts list is locked.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Mark Ordered',
        onPress: () =>
          run(async () => {
            const saved = await saveDraft();
            if (saved) await changeStatus(saved.id, 'order');
          }),
      },
    ]);

  const onReceive = () =>
    Alert.alert(
      'Mark as received?',
      `Adds everything on ${po.po_number} to shop stock:\n\n${po.items
        .map((i) => `+${i.quantity} ${i.name}`)
        .join('\n')}`,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Receive', onPress: () => run(() => changeStatus(poId, 'receive')) },
      ]
    );

  const onCancelPo = () =>
    Alert.alert('Cancel this purchase order?', 'It stays on record as cancelled. Stock isn’t changed.', [
      { text: 'Keep It', style: 'cancel' },
      {
        text: 'Cancel PO',
        style: 'destructive',
        onPress: () => run(() => changeStatus(poId, 'cancel')),
      },
    ]);

  if (error) {
    return (
      <ScreenContainer>
        <EmptyState message={`Couldn't load purchase order: ${error}`} />
      </ScreenContainer>
    );
  }
  if (poId != null && !po) {
    return (
      <ScreenContainer>
        <View style={{ paddingTop: 40, alignItems: 'center' }}>
          <ActivityIndicator size="large" />
        </View>
      </ScreenContainer>
    );
  }

  const status = po?.status || 'draft';
  const timeline = po
    ? [
        `Created ${fmtDate(po.created_at)}${po.created_by_name ? ` by ${po.created_by_name}` : ''}`,
        po.ordered_at && `Ordered ${fmtDate(po.ordered_at)}`,
        po.received_at &&
          `Received ${fmtDate(po.received_at)}${po.received_by_name ? ` by ${po.received_by_name}` : ''}`,
      ].filter(Boolean)
    : [];

  return (
    <ScreenContainer>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text variant="titleLarge">{po ? po.po_number : 'New PO'}</Text>
        <StatusPill state={status} />
      </View>
      {timeline.map((line) => (
        <Text key={line} style={{ color: theme.colors.onSurfaceVariant, marginTop: 2 }}>
          {line}
        </Text>
      ))}

      <SectionHeader>Vendor</SectionHeader>
      {editable ? (
        <>
          <TextField value={vendor} onChangeText={setVendor} placeholder="Who is this order from?" />
          <TextField
            label="Notes (optional)"
            value={notes}
            onChangeText={setNotes}
            placeholder="Vendor order #, delivery details…"
            multiline
          />
        </>
      ) : (
        <Card>
          <Text style={{ fontWeight: '700' }}>{po.vendor}</Text>
          {po.notes ? <Text style={{ marginTop: spacing.xs }}>{po.notes}</Text> : null}
        </Card>
      )}

      <SectionHeader>Parts</SectionHeader>
      {items.length === 0 ? (
        <EmptyState message="No parts on this order yet." />
      ) : (
        items.map((item) => (
          <ListRow
            key={item.part_id}
            title={item.name}
            subtitle={`${item.category} · ${item.unit}`}
            trailing={
              editable ? (
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <TextField
                    value={item.quantity}
                    onChangeText={(q) => setQty(item.part_id, q)}
                    keyboardType="number-pad"
                    style={{ width: 72, marginBottom: 0 }}
                    accessibilityLabel={`Quantity of ${item.name}`}
                  />
                  <IconButton
                    icon="delete-outline"
                    size={20}
                    iconColor={theme.colors.error}
                    onPress={() => removeItem(item.part_id)}
                    accessibilityLabel={`Remove ${item.name}`}
                  />
                </View>
              ) : (
                <Text style={{ fontSize: 18, fontWeight: '700' }}>×{item.quantity}</Text>
              )
            }
          />
        ))
      )}

      {editable ? (
        picking ? (
          <Card style={{ marginTop: spacing.sm }}>
            <SearchField value={query} onChangeText={setQuery} placeholder="Find a part to add" />
            {matches.map((p) => (
              <ListRow
                key={p.id}
                compact
                title={p.name}
                subtitle={`${p.category} · ${p.qty_on_hand} in stock${p.is_low ? ' · LOW' : ''}`}
                onPress={() => addItem(p)}
              />
            ))}
            <Button variant="text" onPress={() => setPicking(false)}>
              Done
            </Button>
          </Card>
        ) : (
          <Button variant="outline" onPress={() => setPicking(true)} style={{ marginTop: spacing.sm }}>
            + Add Part
          </Button>
        )
      ) : null}

      <View style={{ marginTop: spacing.lg, gap: spacing.sm }}>
        {editable ? (
          <>
            <Button variant="secondary" onPress={onSave} disabled={busy}>
              Save Draft
            </Button>
            <Button onPress={onMarkOrdered} loading={busy}>
              Mark as Ordered
            </Button>
          </>
        ) : null}
        {status === 'ordered' ? (
          <Button onPress={onReceive} loading={busy}>
            Mark Received (Add to Stock)
          </Button>
        ) : null}
        {po && ['draft', 'ordered'].includes(status) ? (
          <Button variant="text" onPress={onCancelPo} disabled={busy}>
            Cancel Purchase Order
          </Button>
        ) : null}
      </View>
    </ScreenContainer>
  );
}
