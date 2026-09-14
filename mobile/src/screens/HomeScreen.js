import React, { useCallback, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Text, Button, Avatar, Card } from 'react-native-paper';
import { useAuth } from '../context/AuthContext';
import { useTracking } from '../context/TrackingContext';

// Placeholder landing screen for the authenticated app. Clock in/out and job
// selection (travel/work/pause/finish) still need their own screens — next
// up. Finishing a job already queues a completion (see TrackingContext /
// CompleteJobScreen); the list below is how to reach one until the real
// active-job screen exists.
export default function HomeScreen({ navigation }) {
  const { user, logout } = useAuth();
  const { getPendingCompletions } = useTracking();
  const [pending, setPending] = useState([]);

  useFocusEffect(
    useCallback(() => {
      getPendingCompletions().then(setPending);
    }, [getPendingCompletions])
  );

  return (
    <View style={styles.container}>
      <Avatar.Text size={64} label={initials(user?.full_name)} />
      <Text variant="headlineSmall" style={styles.greeting}>
        Hi, {user?.full_name}
      </Text>
      <Text variant="bodyMedium" style={styles.subtitle}>
        Clock in/out and job selection are coming soon.
      </Text>

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

      <Button mode="outlined" onPress={logout} style={styles.logoutButton}>
        Log Out
      </Button>
    </View>
  );
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
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  greeting: {
    marginTop: 16,
  },
  subtitle: {
    marginTop: 8,
    opacity: 0.7,
    textAlign: 'center',
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
