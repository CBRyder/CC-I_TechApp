import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { useAuth } from '../../context/AuthContext';
import * as api from '../../api/client';
import { ScreenContainer, CalendarRangePicker, Button, SectionHeader, EmptyState, spacing } from '../../ui';
import { currentWorkWeek } from '../../utils/workWeek';

function hrs(n) {
  return `${n.toFixed(2)} hrs`;
}

export default function AdminTimesheetScreen({ navigation }) {
  const { accessToken } = useAuth();
  const [range, setRange] = useState(currentWorkWeek);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const result = await api.getAdminTimesheet(range.start, range.end, accessToken);
      setData(result);
    } catch (err) {
      setError(err.message);
    }
  }, [range, accessToken]);

  useEffect(() => {
    setData(null);
    load();
  }, [load]);

  return (
    <ScreenContainer>
      <CalendarRangePicker
        start={range.start}
        end={range.end}
        onChange={(start, end) => setRange({ start, end })}
      />
      <SectionHeader>All Techs</SectionHeader>
      {error ? (
        <EmptyState message={`Couldn't load timesheets: ${error}`} />
      ) : !data ? (
        <View style={{ paddingTop: 40, alignItems: 'center' }}>
          <ActivityIndicator size="large" />
        </View>
      ) : data.techs.length === 0 ? (
        <EmptyState message="No techs found." />
      ) : (
        data.techs.map((tech) => (
          <Button
            key={tech.user_id}
            variant="outline"
            subtitle={`Billable ${hrs(tech.billable_hours)} · Non-billable ${hrs(tech.non_billable_hours)}`}
            onPress={() =>
              navigation.navigate('AdminTechTimesheet', {
                userId: tech.user_id,
                fullName: tech.full_name,
                start: range.start,
                end: range.end,
              })
            }
            style={{ marginTop: spacing.sm }}
          >
            {tech.full_name} — {hrs(tech.daily_hours)}
          </Button>
        ))
      )}
    </ScreenContainer>
  );
}
