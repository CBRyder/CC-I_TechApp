import React, { useState } from 'react';
import { View, StyleSheet, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { Text, useTheme } from 'react-native-paper';
import { useAuth } from '../../context/AuthContext';
import { Button, TextField, spacing } from '../../ui';

export default function RegisterScreen({ navigation }) {
  const theme = useTheme();
  const { register, error } = useAuth();
  const [fullName, setFullName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleRegister = async () => {
    setSubmitting(true);
    await register({
      full_name: fullName.trim(),
      username: username.trim(),
      email: email.trim() || undefined,
      phone: phone.trim() || undefined,
      password,
    });
    setSubmitting(false);
    // On success, AuthContext logs the user straight in and RootNavigator
    // swaps to AppStack automatically.
  };

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: theme.colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={styles.form}>
        <Text variant="headlineMedium" style={[styles.title, { color: theme.colors.primary }]}>
          Create Account
        </Text>

        <TextField label="Full Name" value={fullName} onChangeText={setFullName} />
        <TextField label="Username" value={username} onChangeText={setUsername} autoCapitalize="none" />
        <TextField
          label="Email (optional)"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
        />
        <TextField
          label="Phone (optional)"
          value={phone}
          onChangeText={setPhone}
          keyboardType="phone-pad"
        />
        <TextField label="Password" value={password} onChangeText={setPassword} secureTextEntry />

        {error ? (
          <Text style={[styles.error, { color: theme.colors.error }]}>{error}</Text>
        ) : null}

        <Button onPress={handleRegister} loading={submitting} disabled={submitting} style={styles.submitButton}>
          Register
        </Button>

        <Button variant="text" onPress={() => navigation.navigate('Login')} style={styles.linkButton}>
          Already have an account? Log In
        </Button>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  form: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    paddingBottom: spacing.xl,
  },
  title: {
    textAlign: 'center',
    fontWeight: '700',
    marginBottom: spacing.lg,
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
