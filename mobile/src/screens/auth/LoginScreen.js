import React, { useState } from 'react';
import { View, StyleSheet, KeyboardAvoidingView, Platform, ScrollView, Alert, Pressable } from 'react-native';
import { Text, Avatar, ActivityIndicator, useTheme } from 'react-native-paper';
import { useAuth } from '../../context/AuthContext';
import { Button, TextField, spacing } from '../../ui';

function initials(name) {
  if (!name) return '?';
  return name
    .split(' ')
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

export default function LoginScreen({ navigation }) {
  const theme = useTheme();
  const { login, error, accounts, switchAccount, removeAccount } = useAuth();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [switchingId, setSwitchingId] = useState(null);

  const handleLogin = async () => {
    setSubmitting(true);
    await login(identifier.trim(), password);
    setSubmitting(false);
    // On success, AuthContext flips isAuthenticated and RootNavigator swaps
    // to AppStack automatically — nothing to navigate to here.
  };

  const handleQuickLogin = async (account) => {
    setSwitchingId(account.id);
    try {
      await switchAccount(account.id);
      // Same as above — isAuthenticated flipping swaps the whole navigator,
      // nothing to navigate to here either.
    } catch (err) {
      // Same dead-refresh-token case as SwitchAccountScreen — offer to
      // forget it rather than leaving a permanently-broken avatar here.
      Alert.alert(
        "Can't log in",
        `This account's saved session has expired and can't be restored automatically. Remove "${account.full_name}" from this device? You can log back into it fresh anytime with its password.`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Remove Account', style: 'destructive', onPress: () => removeAccount(account.id) },
        ]
      );
    } finally {
      setSwitchingId(null);
    }
  };

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: theme.colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {accounts.length > 0 && (
        <View style={styles.quickLoginSection}>
          <Text variant="labelLarge" style={styles.quickLoginLabel}>
            Log in as
          </Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.avatarRow}>
            {accounts.map((account) => (
              <Pressable
                key={account.id}
                onPress={() => handleQuickLogin(account)}
                disabled={switchingId !== null}
                style={styles.avatarItem}
              >
                {switchingId === account.id ? (
                  <View style={styles.avatarLoading}>
                    <ActivityIndicator size="small" />
                  </View>
                ) : (
                  <Avatar.Text size={56} label={initials(account.full_name)} />
                )}
                <Text variant="bodySmall" numberOfLines={1} style={styles.avatarLabel}>
                  {account.full_name}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      )}

      <View style={styles.form}>
        <View style={styles.formContent}>
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
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  quickLoginSection: {
    paddingTop: spacing.xl,
    paddingHorizontal: spacing.lg,
  },
  quickLoginLabel: {
    opacity: 0.7,
    marginBottom: spacing.sm,
    textAlign: 'center',
  },
  avatarRow: {
    flexGrow: 1,
    justifyContent: 'center',
    gap: spacing.md,
    paddingBottom: spacing.xs,
  },
  avatarItem: {
    alignItems: 'center',
    width: 72,
  },
  avatarLoading: {
    width: 56,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarLabel: {
    marginTop: spacing.xs,
    textAlign: 'center',
  },
  form: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
  },
  formContent: {
    width: '100%',
    maxWidth: 400,
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
