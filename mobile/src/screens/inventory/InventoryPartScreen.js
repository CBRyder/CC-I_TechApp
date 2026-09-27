import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, View } from 'react-native';
import { Text, useTheme } from 'react-native-paper';
import { useAuth } from '../../context/AuthContext';
import * as api from '../../api/client';
import {
  Button,
  Card,
  ScreenContainer,
  SectionHeader,
  TextField,
  ListRow,
  EmptyState,
  spacing,
} from '../../ui';

const REASON_LABELS = {
  adjustment: 'Adjusted',
  po_received: 'PO received',
  job_used: 'Used on job',
};

function toField(n) {
  return n == null ? '' : String(n);
}

// One part: edit its details (name, category, unit, sell price, low-stock
// level), adjust or count its stock, and see the history of every change.
// With partId null it's a blank "new part" form instead.
export default function InventoryPartScreen({ route, navigation }) {
  const { partId } = route.params;
  const isNew = partId == null;
  const { accessToken } = useAuth();
  const theme = useTheme();

  const [part, setPart] = useState(null);
  const [error, setError] = useState(null);
  const [form, setForm] = useState({
    name: '',
    category: '',
    unit: 'each',
    sell_price: '',
    low_stock_level: '',
    qty_on_hand: '',
  });
  const [saving, setSaving] = useState(false);
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [adjusting, setAdjusting] = useState(false);

  const fillForm = (p) =>
    setForm({
      name: p.name,
      category: p.category,
      unit: p.unit,
      sell_price: p.sell_price == null ? '' : p.sell_price.toFixed(2),
      low_stock_level: toField(p.low_stock_level),
      qty_on_hand: '',
    });

  const load = useCallback(async () => {
    if (isNew) return;
    setError(null);
    try {
      const p = await api.getInventoryPart(partId, accessToken);
      setPart(p);
      fillForm(p);
      navigation.setOptions({ title: p.name });
    } catch (err) {
      setError(err.message);
    }
  }, [isNew, partId, accessToken, navigation]);

  useEffect(() => {
    if (isNew) navigation.setOptions({ title: 'New Part' });
    load();
  }, [isNew, load, navigation]);

  const set = (key) => (value) => setForm((f) => ({ ...f, [key]: value }));

  const save = async () => {
    setSaving(true);
    const fields = {
      name: form.name,
      category: form.category,
      unit: form.unit || 'each',
      sell_price: form.sell_price.trim() === '' ? null : form.sell_price.replace('$', ''),
      low_stock_level: form.low_stock_level.trim() === '' ? null : form.low_stock_level,
    };
    try {
      if (isNew) {
        const created = await api.createInventoryPart(
          { ...fields, qty_on_hand: form.qty_on_hand || 0 },
          accessToken
        );
        navigation.replace('InventoryPart', { partId: created.id });
      } else {
        const updated = await api.updateInventoryPart(partId, fields, accessToken);
        setPart((p) => ({ ...p, ...updated }));
        navigation.setOptions({ title: updated.name });
        Alert.alert('Saved', `${updated.name} updated.`);
      }
    } catch (err) {
      Alert.alert("Couldn't save part", err.message);
    } finally {
      setSaving(false);
    }
  };

  // mode: 'add' | 'remove' | 'count'
  const adjust = async (mode) => {
    const n = Number(amount);
    if (!amount.trim() || !Number.isInteger(n) || n < 0 || (mode !== 'count' && n === 0)) {
      Alert.alert('Enter a whole number', mode === 'count' ? 'How many are on the shelf?' : 'How many to add or remove?');
      return;
    }
    setAdjusting(true);
    try {
      const body =
        mode === 'count' ? { count: n, note } : { change: mode === 'add' ? n : -n, note };
      await api.adjustInventoryStock(partId, body, accessToken);
      setAmount('');
      setNote('');
      await load();
    } catch (err) {
      Alert.alert("Couldn't update stock", err.message);
    } finally {
      setAdjusting(false);
    }
  };

  const toggleActive = () => {
    const deactivate = part.status === 'active';
    Alert.alert(
      deactivate ? `Hide ${part.name}?` : `Bring back ${part.name}?`,
      deactivate
        ? 'Techs will no longer see it in the parts picker. Its stock and history are kept, and you can bring it back any time.'
        : 'Techs will see it in the parts picker again.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: deactivate ? 'Hide' : 'Bring Back',
          onPress: async () => {
            try {
              await api.updateInventoryPart(
                partId,
                { status: deactivate ? 'inactive' : 'active' },
                accessToken
              );
              load();
            } catch (err) {
              Alert.alert("Couldn't update part", err.message);
            }
          },
        },
      ]
    );
  };

  if (error) {
    return (
      <ScreenContainer>
        <EmptyState message={`Couldn't load part: ${error}`} />
      </ScreenContainer>
    );
  }
  if (!isNew && !part) {
    return (
      <ScreenContainer>
        <View style={{ paddingTop: 40, alignItems: 'center' }}>
          <ActivityIndicator size="large" />
        </View>
      </ScreenContainer>
    );
  }

  const warn = part && part.is_low;

  return (
    <ScreenContainer>
      {part ? (
        <Card style={{ alignItems: 'center', marginBottom: spacing.sm }}>
          <Text
            style={{
              fontSize: 40,
              fontWeight: '800',
              color: warn ? theme.colors.error : theme.colors.onSurface,
            }}
          >
            {part.qty_on_hand}
          </Text>
          <Text style={{ color: theme.colors.onSurfaceVariant }}>
            {part.unit} in stock
            {part.qty_on_order ? ` · ${part.qty_on_order} on order` : ''}
          </Text>
          {warn ? (
            <Text style={{ color: theme.colors.error, fontWeight: '700', marginTop: spacing.xs }}>
              {part.qty_on_hand < 0 ? 'Below zero — needs a count' : 'At or below low-stock level'}
            </Text>
          ) : null}
          {part.status === 'inactive' ? (
            <Text style={{ color: theme.colors.onSurfaceVariant, marginTop: spacing.xs }}>
              Hidden from techs
            </Text>
          ) : null}
        </Card>
      ) : null}

      {part ? (
        <>
          <SectionHeader>Update Stock</SectionHeader>
          <TextField
            label="Amount"
            value={amount}
            onChangeText={setAmount}
            keyboardType="number-pad"
            placeholder="e.g. 5"
          />
          <TextField
            label="Note (optional)"
            value={note}
            onChangeText={setNote}
            placeholder="e.g. damaged, returned, shelf count"
          />
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            <Button onPress={() => adjust('add')} disabled={adjusting} style={{ flex: 1 }}>
              Add
            </Button>
            <Button
              variant="outline"
              onPress={() => adjust('remove')}
              disabled={adjusting}
              style={{ flex: 1 }}
            >
              Remove
            </Button>
          </View>
          <Button
            variant="secondary"
            onPress={() => adjust('count')}
            loading={adjusting}
            style={{ marginTop: spacing.sm }}
          >
            Set as Shelf Count
          </Button>
        </>
      ) : null}

      <SectionHeader>{isNew ? 'New Part' : 'Details'}</SectionHeader>
      <TextField label="Name" value={form.name} onChangeText={set('name')} placeholder="e.g. GFCI Outlet" />
      <TextField
        label="Category"
        value={form.category}
        onChangeText={set('category')}
        placeholder="e.g. Electrical"
      />
      <TextField label="Unit" value={form.unit} onChangeText={set('unit')} placeholder="each, box, ft, roll" />
      <TextField
        label="Sell price (per unit)"
        value={form.sell_price}
        onChangeText={set('sell_price')}
        keyboardType="decimal-pad"
        placeholder="e.g. 12.50"
      />
      <TextField
        label="Low-stock level"
        value={form.low_stock_level}
        onChangeText={set('low_stock_level')}
        keyboardType="number-pad"
        placeholder="Warn at or below this many (blank = no warning)"
      />
      {isNew ? (
        <TextField
          label="Starting quantity"
          value={form.qty_on_hand}
          onChangeText={set('qty_on_hand')}
          keyboardType="number-pad"
          placeholder="0"
        />
      ) : null}
      <Button onPress={save} loading={saving} style={{ marginTop: spacing.sm }}>
        {isNew ? 'Add Part' : 'Save Details'}
      </Button>

      {part ? (
        <>
          <Button variant="text" onPress={toggleActive} style={{ marginTop: spacing.sm }}>
            {part.status === 'active' ? 'Hide From Techs' : 'Bring Back For Techs'}
          </Button>

          <SectionHeader>History</SectionHeader>
          {part.movements.length === 0 ? (
            <EmptyState message="No stock changes yet." />
          ) : (
            part.movements.map((m) => {
              const source =
                m.reason === 'po_received'
                  ? m.po_number
                  : m.reason === 'job_used'
                    ? m.job_number && `Job ${m.job_number}`
                    : m.note;
              return (
                <ListRow
                  key={m.id}
                  compact
                  title={[REASON_LABELS[m.reason], source].filter(Boolean).join(' · ')}
                  subtitle={`${new Date(m.created_at).toLocaleString()}${m.user_name ? ` · ${m.user_name}` : ''}`}
                  trailing={
                    <Text
                      style={{
                        fontWeight: '700',
                        color: m.change < 0 ? theme.colors.error : theme.colors.primary,
                      }}
                    >
                      {m.change > 0 ? `+${m.change}` : m.change}
                    </Text>
                  }
                />
              );
            })
          )}
        </>
      ) : null}
    </ScreenContainer>
  );
}
