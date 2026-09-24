import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { useAuth } from '../context/AuthContext';
import * as api from '../api/client';
import { ScreenContainer, CalendarRangePicker, EmptyState } from '../ui';
import { currentWorkWeek } from '../utils/workWeek';
import TimesheetBody from './TimesheetBody';

export default function TimesheetScreen() {
  const { accessToken } = useAuth();
  const [range, setRange] = useState(currentWorkWeek);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const result = await api.getTimesheet(range.start, range.end, accessToken);
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
