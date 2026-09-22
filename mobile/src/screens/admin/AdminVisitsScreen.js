import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator } from 'react-native';
import { useAuth } from '../../context/AuthContext';
import * as api from '../../api/client';
import { ScreenContainer, SectionHeader, EmptyState, SearchField, Card, spacing } from '../../ui';
import { Text, TouchableRipple, useTheme } from 'react-native-paper';

// Completed visits only — the admin oversight view for "what's been
// finished and needs review/PO'd," not the full incoming/in-progress list
// (no UI need for those yet).
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
        setVisits(await api.listAdminVisits({ status: 'completed', q: q || undefined }, accessToken));
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
      <SectionHeader>Completed Jobs</SectionHeader>
      <SearchField
        value={query}
        onChangeText={handleSearch}
        placeholder="Search job number or visit code"
        style={{ marginBottom: spacing.md }}
      />

      {visits === null && !error && <ActivityIndicator style={{ marginTop: spacing.xl }} />}
      {error && <EmptyState message={`Couldn't load visits: ${error}`} />}
      {visits && visits.length === 0 && <EmptyState message="No completed visits found." />}

      {visits &&
        visits.map((visit) => (
          <TouchableRipple
            key={visit.assignment_id}
            onPress={() => navigation.navigate('AdminVisitDetail', { assignmentId: visit.assignment_id })}
            style={{ marginBottom: spacing.sm }}
          >
            <Card>
              <Text variant="titleMedium">{visit.job_name}</Text>
              <Text variant="bodySmall" style={{ opacity: 0.7 }}>
                {visit.visit_code} · {visit.customer_name || visit.address}
              </Text>
              <Text variant="bodySmall" style={{ opacity: 0.7, marginTop: spacing.xs }}>
                {visit.assigned_to} · {new Date(visit.assigned_date).toLocaleDateString()}
              </Text>
            </Card>
          </TouchableRipple>
        ))}
    </ScreenContainer>
  );
}
