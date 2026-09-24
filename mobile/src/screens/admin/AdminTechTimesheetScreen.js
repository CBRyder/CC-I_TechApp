import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Text } from 'react-native-paper';
import { useAuth } from '../../context/AuthContext';
import * as api from '../../api/client';
import { ScreenContainer, CalendarRangePicker, EmptyState, spacing } from '../../ui';
import TimesheetBody from '../TimesheetBody';

export default function AdminTechTimesheetScreen({ route }) {
  const { userId, fullName, start: initialStart, end: initialEnd } = route.params;
  const { accessToken } = useAuth();
  const [range, setRange] = useState({ start: initialStart, end: initialEnd });
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const result = await api.getAdminTechTimesheet(userId, range.start, range.end, accessToken);
      setData(result);
    } catch (err) {
      setError(err.message);
    }
  }, [userId, range, accessToken]);

  useEffect(() => {
    setData(null);
    load();
  }, [load]);

  return (
    <ScreenContainer>
      <Text variant="titleLarge" style={{ marginBottom: spacing.sm }}>
        {fullName}
      </Text>
      <CalendarRangePicker
        start={range.start}
        end={range.end}
        onChange={(start, end) => setRange({ start, end })}
      />
      {error ? (
        <EmptyState message={`Couldn't load timesheet: ${error}`} />
      ) : !data ? (
        <View style={{ paddingTop: 40, alignItems: 'center' }}>
          <ActivityIndicator size="large" />
        </View>
      ) : (
        <TimesheetBody data={data} />
      )}
    </ScreenContainer>
  );
}
