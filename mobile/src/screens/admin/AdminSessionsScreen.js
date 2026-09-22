import React, { useCallback, useState } from 'react';
import { Alert, ActivityIndicator, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Text, useTheme } from 'react-native-paper';
import { useAuth } from '../../context/AuthContext';
import * as api from '../../api/client';
import { ScreenContainer, SectionHeader, ListRow, EmptyState, spacing } from '../../ui';

export default function AdminSessionsScreen() {
  const { accessToken } = useAuth();
  const theme = useTheme();
  const [sessions, setSessions] = useState(null);
  const [error, setError] = useState(null);
  const [revoking, setRevoking] = useState(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      setSessions(await api.listAdminSessions(accessToken));
    } catch (err) {
      setError(err.message);
    }
  }, [accessToken]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const revoke = (session) => {
    Alert.alert(
      'Revoke device?',
      `This will sign ${session.full_name} out of ${session.device_label}. They can sign in again if they have their password.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Revoke',
          style: 'destructive',
          onPress: async () => {
            setRevoking(session.session_id);
            try {
              await api.revokeAdminSession(session.session_id, accessToken);
              setSessions((current) =>
                current?.filter((item) => item.session_id !== session.session_id) ?? []
              );
            } catch (err) {
              Alert.alert("Couldn't revoke device", err.message);
            } finally {
              setRevoking(null);
            }
          },
        },
      ]
    );
  };

  if (sessions === null && !error) {
    return (
      <ScreenContainer>
        <ActivityIndicator style={{ marginTop: spacing.xl }} />
      </ScreenContainer>
    );
  }

  if (error) {
    return (
      <ScreenContainer>
        <EmptyState message={`Couldn't load sessions: ${error}`} />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <SectionHeader>Active Devices</SectionHeader>
      {sessions.length === 0 ? (
        <EmptyState message="No active device sessions." />
      ) : (
        sessions.map((session) => (
          <View key={session.session_id} style={{ marginBottom: spacing.xs }}>
            <ListRow
              title={`${session.full_name} — ${session.device_label}`}
              subtitle={`Last used ${session.last_used_at ? new Date(session.last_used_at).toLocaleString() : 'just now'}`}
              onPress={() => revoke(session)}
              trailing={
                revoking === session.session_id ? (
                  <ActivityIndicator />
                ) : (
                  <Text style={{ color: theme.colors.error, fontWeight: '700' }}>Revoke</Text>
                )
              }
            />
          </View>
        ))
      )}
    </ScreenContainer>
  );
}
