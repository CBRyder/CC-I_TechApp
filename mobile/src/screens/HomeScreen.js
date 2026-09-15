import React, { useCallback, useState } from 'react';
import { StyleSheet } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Text, Button, Avatar, Card } from 'react-native-paper';
import { useAuth } from '../context/AuthContext';
import { useTracking } from '../context/TrackingContext';
import { ScreenContainer, ClockBanner } from '../ui';

const STATE_LABELS = {
  travel: 'Traveling to job',
  work: 'Working',
  pause: 'Paused',
};

export default function HomeScreen({ navigation }) {
  const { user, logout } = useAuth();
  const { timeEntry, activeSegment, isClockedIn, clockIn, clockOut, transitionState, finishJob } =
    useTracking();
  const { getPendingCompletions } = useTracking();
  const [pending, setPending] = useState([]);

  useFocusEffect(
    useCallback(() => {
      getPendingCompletions().then(setPending);
    }, [getPendingCompletions])
  );

  const handleFinish = async () => {
    const completionClientId = await finishJob();
    if (completionClientId) {
      navigation.navigate('CompleteJob', { completionClientId });
    }
  };

  return (
    <ScreenContainer 
        header={
          <ClockBanner
            date={new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
            isClockedIn={isClockedIn}
            showHeading={false}
            showButton={false}
          />
        }
      >
      <Avatar.Text size={64} label={initials(user?.full_name)} /><Text variant="headlineSmall" style={styles.greeting}>
        Hi, {user?.full_name}
      </Text>

      {!isClockedIn && (
        <>
          <Text variant="bodyMedium" style={styles.subtitle}>
            You're clocked out.
          </Text>
          <Button mode="contained" onPress={clockIn} style={styles.primaryButton}>
            Clock In
          </Button>
        </>
      )}

      {isClockedIn && !activeSegment && (
        <>
          <Text variant="bodyMedium" style={styles.subtitle}>
            Clocked in at {formatTime(timeEntry.clock_in_at)}
          </Text>
          <Button
            mode="contained"
            onPress={() => navigation.navigate('JobSelection')}
            style={styles.primaryButton}
          >
            Select a Job
          </Button>
          <Button mode="outlined" onPress={clockOut} style={styles.secondaryButton}>
            Clock Out
          </Button>
        </>
      )}

      {isClockedIn && activeSegment && (
        <Card style={styles.jobCard}>
          <Card.Title
            title={activeSegment.name || 'Job'}
            subtitle={`${activeSegment.job_number || ''}${
              activeSegment.address ? ' • ' + activeSegment.address : ''
            }`}
          />
          <Card.Content>
            <Text variant="titleMedium">{STATE_LABELS[activeSegment.state] || activeSegment.state}</Text>
            <Text variant="bodySmall" style={styles.muted}>
              Since {formatTime(activeSegment.started_at)}
            </Text>

            {activeSegment.state === 'travel' && (
              <Button mode="contained" onPress={() => transitionState('work')} style={styles.cardButton}>
                Arrived — Start Work
              </Button>
            )}
            {activeSegment.state === 'work' && (
              <Button mode="outlined" onPress={() => transitionState('pause')} style={styles.cardButton}>
                Pause
              </Button>
            )}
            {activeSegment.state === 'pause' && (
              <Button mode="contained" onPress={() => transitionState('work')} style={styles.cardButton}>
                Resume Work
              </Button>
            )}
            <Button mode="contained" onPress={handleFinish} style={styles.cardButton}>
              Finish Job
            </Button>
          </Card.Content>
        </Card>
      )}

      {pending.length > 0 && (
        <Card style={styles.pendingCard}>
          <Card.Title title="Pending Completions" subtitle={`${pending.length} awaiting details`} />
          <Card.Content>
            {pending.map((completion) => (
              <Button
                key={completion.client_id}
                mode="outlined"
                style={styles.pendingButton}
                onPress={() =>
                  navigation.navigate('CompleteJob', { completionClientId: completion.client_id })
                }
              >
                {completion.job_name || completion.job_number || 'Unnamed job'}
              </Button>
            ))}
          </Card.Content>
        </Card>
      )}

      <Button mode="text" onPress={logout} style={styles.logoutButton}>
        Log Out
      </Button>
    </ScreenContainer>
  );
}

function formatTime(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function initials(name) {
  if (!name) return '?';
  return name
    .split(' ')
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

const styles = StyleSheet.create({
  greeting: {
    marginTop: 16,
  },
  subtitle: {
    marginTop: 8,
    marginBottom: 16,
    opacity: 0.7,
    textAlign: 'center',
  },
  muted: {
    opacity: 0.6,
    marginTop: 4,
    marginBottom: 12,
  },
  primaryButton: {
    marginTop: 8,
    width: '100%',
  },
  secondaryButton: {
    marginTop: 12,
    width: '100%',
  },
  jobCard: {
    marginTop: 16,
    width: '100%',
  },
  cardButton: {
    marginTop: 12,
  },
  pendingCard: {
    marginTop: 24,
    width: '100%',
  },
  pendingButton: {
    marginTop: 8,
  },
  logoutButton: {
    marginTop: 32,
  },
});
