import React, { useState } from 'react';
import { View, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native';
import { Text, useTheme } from 'react-native-paper';
import { useAuth } from '../../context/AuthContext';
import { Button, TextField, spacing } from '../../ui';

export default function LoginScreen({ navigation }) {
  const theme = useTheme();
  const { login, error } = useAuth();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleLogin = async () => {
    setSubmitting(true);
    await login(identifier.trim(), password);
    setSubmitting(false);
    // On success, AuthContext flips isAuthenticated and RootNavigator swaps
    // to AppStack automatically — nothing to navigate to here.
  };

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: theme.colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.form}>
        <Text variant="headlineMedium" style={[styles.title, { color: theme.colors.primary }]}>
          CC-I Tech App
        </Text>
        <Text variant="bodyMedium" style={styles.subtitle}>
          Sign in to continue
        </Text>

        <TextField
          label="Username or Email"
          value={identifier}
          onChangeText={setIdentifier}
          autoCapitalize="none"
        />
        <TextField
          label="Password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
        />

        {error ? (
          <Text style={[styles.error, { color: theme.colors.error }]}>{error}</Text>
        ) : null}

        <Button onPress={handleLogin} loading={submitting} disabled={submitting} style={styles.submitButton}>
          Log In
        </Button>

        <Button variant="text" onPress={() => navigation.navigate('Register')} style={styles.linkButton}>
          Need an account? Register
        </Button>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
  },
  form: {
    paddingHorizontal: spacing.lg,
  },
  title: {
    textAlign: 'center',
    fontWeight: '700',
  },
  subtitle: {
    textAlign: 'center',
    marginTop: spacing.xs,
    marginBottom: spacing.lg,
    opacity: 0.7,
  },
  error: {
    fontSize: 13,
    marginBottom: spacing.sm,
  },
  submitButton: {
    marginTop: spacing.xs,
  },
  linkButton: {
    marginTop: spacing.sm,
  },
});
