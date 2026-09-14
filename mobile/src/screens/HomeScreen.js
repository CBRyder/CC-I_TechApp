import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text, Button, Avatar } from 'react-native-paper';
import { useAuth } from '../context/AuthContext';

// Placeholder landing screen for the authenticated app. Clock in/out, job
// selection, and timesheet screens get added here once their backend routes
// exist (see backend/migrations/001_init.sql for the tables already in place).
export default function HomeScreen() {
  const { user, logout } = useAuth();

  return (
    <View style={styles.container}>
      <Avatar.Text size={64} label={initials(user?.full_name)} />
      <Text variant="headlineSmall" style={styles.greeting}>
        Hi, {user?.full_name}
      </Text>
      <Text variant="bodyMedium" style={styles.subtitle}>
        Clock in/out and job selection are coming soon.
      </Text>

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
  logoutButton: {
    marginTop: 32,
  },
});
