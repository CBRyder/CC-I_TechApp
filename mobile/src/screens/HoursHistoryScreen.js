import React, { useEffect, useState } from 'react';
import { Text } from 'react-native-paper';
import { useTracking } from '../context/TrackingContext';
import { ScreenContainer, ListRow, EmptyState } from '../ui';

export default function HoursHistoryScreen() {
  const { getHoursHistory } = useTracking();
  const [days, setDays] = useState(null);

  useEffect(() => {
    getHoursHistory().then(setDays);
  }, [getHoursHistory]);

  if (!days) return null;

  return (
    <ScreenContainer>
      {days.length === 0 ? (
        <EmptyState message="No clock history on this device yet." />
      ) : (
        days.map((day) => (
          <ListRow key={day.date} title={formatDate(day.date)} trailing={<Text>{day.totalHours.toFixed(1)} hrs</Text>} />
        ))
      )}
    </ScreenContainer>
  );
}

function formatDate(dateStr) {
  // dateStr is 'YYYY-MM-DD' — parse as local, not UTC (new Date('YYYY-MM-DD')
  // treats it as UTC midnight, which can roll to the wrong day locally).
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}
