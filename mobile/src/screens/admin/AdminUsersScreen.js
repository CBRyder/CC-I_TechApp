import React, { useCallback, useEffect, useState } from 'react';
import { View, Alert, ActivityIndicator } from 'react-native';
import { Text, Chip, IconButton, useTheme } from 'react-native-paper';
import { useAuth } from '../../context/AuthContext';
import * as api from '../../api/client';
import { ScreenContainer, SectionHeader, EmptyState, SegmentedTabs, spacing, radius } from '../../ui';

const ALL_ROLES = ['tech', 'admin'];

// 3-way toggle, not two independent checkboxes — a tech can be both, but
// picking a position is clearer UX than two chips that both happen to be on.
const TECH_TYPE_SEGMENTS = ['Shop', 'Both', 'Road'];

function techTypesToSegment(techTypes) {
  if (techTypes.length === 2) return 'Both';
  return techTypes[0] === 'shop' ? 'Shop' : 'Road';
}

function segmentToTechTypes(segment) {
  if (segment === 'Both') return ['shop', 'road'];
  return segment === 'Shop' ? ['shop'] : ['road'];
}

export default function AdminUsersScreen() {
  const { user, accessToken } = useAuth();
  const theme = useTheme();
  const [users, setUsers] = useState(null); // null while loading, [] once loaded
  const [savingUserId, setSavingUserId] = useState(null);
  const [savingTechTypeId, setSavingTechTypeId] = useState(null);
  const [deletingUserId, setDeletingUserId] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      setUsers(await api.listAdminUsers(accessToken));
    } catch (err) {
      setError(err.message);
    }
  }, [accessToken]);

  useEffect(() => {
    load();
  }, [load]);

  const toggleRole = async (target, role) => {
    const hasRole = target.roles.includes(role);
    const nextRoles = hasRole ? target.roles.filter((r) => r !== role) : [...target.roles, role];

    if (nextRoles.length === 0) {
      Alert.alert('At least one role required', 'Remove the other role first if you want to change this one instead.');
      return;
    }

    const previousUsers = users;
    // Optimistic: update the UI immediately, revert if the request fails.
    setUsers((current) => current.map((u) => (u.id === target.id ? { ...u, roles: nextRoles } : u)));
    setSavingUserId(target.id);
    try {
      await api.updateUserRoles(target.id, nextRoles, accessToken);
    } catch (err) {
      setUsers(previousUsers);
      Alert.alert("Couldn't update roles", err.message);
    } finally {
      setSavingUserId(null);
    }
  };

  const changeTechType = async (target, segment) => {
    const nextTechTypes = segmentToTechTypes(segment);
    const previousUsers = users;
    setUsers((current) =>
      current.map((u) => (u.id === target.id ? { ...u, tech_types: nextTechTypes } : u))
    );
    setSavingTechTypeId(target.id);
    try {
      await api.updateUserTechTypes(target.id, nextTechTypes, accessToken);
    } catch (err) {
      setUsers(previousUsers);
      Alert.alert("Couldn't update tech type", err.message);
    } finally {
      setSavingTechTypeId(null);
    }
  };

  const confirmDelete = (target) => {
    Alert.alert(
      'Delete user?',
      `Remove "${target.full_name}" (${target.username})? They'll be signed out everywhere and won't be able to log back in. Their work history is kept, not deleted.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            const previousUsers = users;
            setUsers((current) => current.filter((u) => u.id !== target.id));
            setDeletingUserId(target.id);
            try {
              await api.deleteUser(target.id, accessToken);
            } catch (err) {
              setUsers(previousUsers);
              Alert.alert("Couldn't delete user", err.message);
            } finally {
              setDeletingUserId(null);
            }
          },
        },
      ]
    );
  };

  if (users === null && !error) {
    return (
      <ScreenContainer>
        <ActivityIndicator style={{ marginTop: spacing.xl }} />
      </ScreenContainer>
    );
  }

  if (error) {
    return (
      <ScreenContainer>
        <EmptyState message={`Couldn't load users: ${error}`} />
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <SectionHeader>Users &amp; Roles</SectionHeader>
      {users.length === 0 ? (
        <EmptyState message="No users found." />
      ) : (
        users.map((target) => (
          <View
            key={target.id}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              paddingVertical: spacing.md,
              borderBottomWidth: 1,
              borderBottomColor: theme.colors.outlineVariant ?? '#0002',
            }}
          >
            <View style={{ flex: 1 }}>
              <Text variant="titleMedium">
                {target.full_name}
                {target.id === user?.id ? ' (you)' : ''}
              </Text>
              <Text variant="bodySmall" style={{ opacity: 0.7, marginBottom: spacing.sm }}>
                {target.username}
                {target.email ? ` · ${target.email}` : ''}
              </Text>
              <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                {ALL_ROLES.map((role) => (
                  <Chip
                    key={role}
                    selected={target.roles.includes(role)}
                    disabled={savingUserId === target.id}
                    onPress={() => toggleRole(target, role)}
                    style={{ borderRadius: radius.pill }}
                  >
                    {role}
                  </Chip>
                ))}
                {savingUserId === target.id && <ActivityIndicator size="small" />}
              </View>
              {target.roles.includes('tech') && (
                <View style={{ marginTop: spacing.sm, maxWidth: 260 }}>
                  <SegmentedTabs
                    options={TECH_TYPE_SEGMENTS}
                    value={techTypesToSegment(target.tech_types)}
                    onChange={(segment) => changeTechType(target, segment)}
                  />
                  {savingTechTypeId === target.id && (
                    <ActivityIndicator size="small" style={{ marginTop: spacing.xs }} />
                  )}
                </View>
              )}
            </View>
            {target.id === user?.id ? (
              // Can't delete your own account — no button at all here,
              // rather than a disabled one that just alerts on tap.
              <View style={{ width: 48 }} />
            ) : deletingUserId === target.id ? (
              <ActivityIndicator style={{ width: 48 }} />
            ) : (
              <IconButton
                icon="delete-outline"
                iconColor={theme.colors.error}
                onPress={() => confirmDelete(target)}
                accessibilityLabel={`Delete ${target.full_name}`}
              />
            )}
          </View>
        ))
      )}
    </ScreenContainer>
  );
}
