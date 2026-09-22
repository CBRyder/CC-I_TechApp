import React, { useCallback, useEffect, useState } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { useAuth } from '../../context/AuthContext';
import * as api from '../../api/client';
import {
  ScreenContainer,
  SectionHeader,
  EmptyState,
  SearchField,
  Card,
  StatusPill,
  spacing,
} from '../../ui';
import { Text, TouchableRipple, useTheme } from 'react-native-paper';

const STATE_LEGEND = [
  { state: 'at_shop', description: "Created, sitting at the shop — a shop tech hasn't started it yet." },
  { state: 'incoming', description: "Created, not yet started — a road tech hasn't headed out yet." },
  { state: 'in_progress', description: 'Work has started and is ongoing (including any on-site pause).' },
  { state: 'shop_return', description: 'A shop tech finished their part — ready to be picked up.' },
  { state: 'completed', description: 'Finished by a road tech.' },
];

// Every job, across all 5 statuses — the admin oversight view. Status is
// purely derived (see backend/src/routes/admin.js): a shop tech and a road
// tech doing the exact same actions (start work, tap Finish) show up under
// different labels here (At the Shop/Shop Return vs Incoming/Completed).
export default function AdminVisitsScreen({ navigation }) {
  const { accessToken } = useAuth();
  const theme = useTheme();
  const [query, setQuery] = useState('');
  const [visits, setVisits] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(
    async (q) => {
      try {
        setError(null);
        setVisits(await api.listAdminVisits({ q: q || undefined }, accessToken));
      } catch (err) {
        setError(err.message);
      }
    },
    [accessToken]
  );

  useEffect(() => {
    load(query);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken]);

  const handleSearch = (text) => {
    setQuery(text);
    load(text);
  };

  return (
    <ScreenContainer>
      <SectionHeader>Job Statuses</SectionHeader>
      {STATE_LEGEND.map(({ state, description }) => (
        <View key={state} style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: spacing.sm }}>
          <StatusPill state={state} />
          <Text
            variant="bodySmall"
            style={{ flex: 1, marginLeft: spacing.sm, opacity: 0.7, marginTop: 2 }}
          >
            {description}
          </Text>
        </View>
      ))}

      <SectionHeader>All Jobs</SectionHeader>
      <SearchField
        value={query}
        onChangeText={handleSearch}
        placeholder="Search job number or visit code"
        style={{ marginBottom: spacing.md }}
      />

      {visits === null && !error && <ActivityIndicator style={{ marginTop: spacing.xl }} />}
      {error && <EmptyState message={`Couldn't load visits: ${error}`} />}
      {visits && visits.length === 0 && <EmptyState message="No jobs found." />}

      {visits &&
        visits.map((visit) => (
          <TouchableRipple
            key={visit.assignment_id}
            onPress={() => navigation.navigate('AdminVisitDetail', { assignmentId: visit.assignment_id })}
            style={{ marginBottom: spacing.sm }}
          >
            <Card>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <View style={{ flex: 1, marginRight: spacing.sm }}>
                  <Text variant="titleMedium">{visit.customer_name || 'No umbrella set'}</Text>
                  <Text variant="bodyMedium" style={{ opacity: 0.85 }}>
                    {visit.location_name || visit.job_name}
                  </Text>
                </View>
                <StatusPill state={visit.status} />
              </View>
              <Text variant="bodySmall" style={{ opacity: 0.7, marginTop: spacing.xs }}>
                {visit.visit_code} · {visit.assigned_to}
              </Text>
              <Text variant="bodySmall" style={{ opacity: 0.7 }}>
                {new Date(visit.assigned_date).toLocaleDateString()}
              </Text>
            </Card>
          </TouchableRipple>
        ))}
    </ScreenContainer>
  );
}
