import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import HomeScreen from '../screens/HomeScreen';
import JobDetailScreen from '../screens/JobDetailScreen';
import CompleteJobScreen from '../screens/CompleteJobScreen';
import VisitDetailScreen from '../screens/VisitDetailScreen';
import HoursHistoryScreen from '../screens/HoursHistoryScreen';
import SettingsScreen from '../screens/SettingsScreen';
import SwitchAccountScreen from '../screens/SwitchAccountScreen';
import EditProfileScreen from '../screens/EditProfileScreen';
import ChangePasswordScreen from '../screens/ChangePasswordScreen';
import PartsCategoryScreen from '../screens/parts/PartsCategoryScreen';
import PartsListScreen from '../screens/parts/PartsListScreen';
import ComponentGalleryScreen from '../screens/dev/ComponentGalleryScreen';
import AdminUsersScreen from '../screens/admin/AdminUsersScreen';
import AdminSessionsScreen from '../screens/admin/AdminSessionsScreen';
import AdminHomeScreen from '../screens/admin/AdminHomeScreen';
import AdminVisitsScreen from '../screens/admin/AdminVisitsScreen';
import AdminVisitDetailScreen from '../screens/admin/AdminVisitDetailScreen';
import AdminCreateCustomerScreen from '../screens/admin/AdminCreateCustomerScreen';
import AdminCreateJobScreen from '../screens/admin/AdminCreateJobScreen';
import AdminAssignVisitScreen from '../screens/admin/AdminAssignVisitScreen';
import { useAuth } from '../context/AuthContext';

const Stack = createNativeStackNavigator();

export default function AppStack() {
  // Dev-only tools (ComponentGallery, the data-clear button, etc.) — only
  // registered as a route at all for accounts holding the 'dev' role, same
  // pattern as the 'admin' role gating job assignment. A tech without it
  // has no way to reach this screen, not even by guessing the route name.
  const { user } = useAuth();
  const isDev = user?.roles?.includes('dev');
  const isAdmin = user?.roles?.includes('admin');
  const isTech = user?.roles?.includes('tech');

  // Every tech-facing screen (clock in/out, job selection, parts, hours) is
  // meaningless — and per-account local data it shouldn't even touch — for
  // an admin-only account (admin without tech), so those routes aren't
  // registered at all for one, not just hidden behind nav links. It lands
  // on AdminHome instead of Home and has no way to reach any of them, not
  // even by guessing a route name.
  const initialRouteName = isTech ? 'Home' : isAdmin ? 'AdminHome' : 'Settings';

  return (
    <Stack.Navigator initialRouteName={initialRouteName}>
      {isTech && (
        <>
          <Stack.Screen name="Home" component={HomeScreen} options={{ title: 'CC-I Tech App' }} />
          <Stack.Screen
            name="JobDetail"
            component={JobDetailScreen}
            options={{ title: 'Job Details' }}
          />
          <Stack.Screen
            name="CompleteJob"
            component={CompleteJobScreen}
            options={{ title: 'Complete Job' }}
          />
          <Stack.Screen
            name="VisitDetail"
            component={VisitDetailScreen}
            options={{ title: 'Visit Details' }}
          />
          <Stack.Screen
            name="HoursHistory"
            component={HoursHistoryScreen}
            options={{ title: 'Hours' }}
          />
          <Stack.Screen
            name="PartsCategory"
            component={PartsCategoryScreen}
            options={{ title: 'Parts Used' }}
          />
          <Stack.Screen
            name="PartsList"
            component={PartsListScreen}
            options={{ title: 'Select Part' }}
          />
        </>
      )}
      <Stack.Screen name="Settings" component={SettingsScreen} options={{ title: 'Settings' }} />
      <Stack.Screen
        name="SwitchAccount"
        component={SwitchAccountScreen}
        options={{ title: 'Switch Account' }}
      />
      <Stack.Screen
        name="EditProfile"
        component={EditProfileScreen}
        options={{ title: 'Edit Profile' }}
      />
      <Stack.Screen
        name="ChangePassword"
        component={ChangePasswordScreen}
        options={{ title: 'Change Password' }}
      />
      {isAdmin && (
        <>
          <Stack.Screen
            name="AdminHome"
            component={AdminHomeScreen}
            options={{ title: isTech ? 'Admin' : 'CC-I Tech App' }}
          />
          <Stack.Screen
            name="AdminUsers"
            component={AdminUsersScreen}
            options={{ title: 'Users & Roles' }}
          />
          <Stack.Screen
            name="AdminSessions"
            component={AdminSessionsScreen}
            options={{ title: 'Active Devices' }}
          />
          <Stack.Screen
            name="AdminVisits"
            component={AdminVisitsScreen}
            options={{ title: 'Completed Jobs' }}
          />
          <Stack.Screen
            name="AdminVisitDetail"
            component={AdminVisitDetailScreen}
            options={{ title: 'Visit Detail' }}
          />
          <Stack.Screen
            name="AdminCreateCustomer"
            component={AdminCreateCustomerScreen}
            options={{ title: 'New Customer' }}
          />
          <Stack.Screen
            name="AdminCreateJob"
            component={AdminCreateJobScreen}
            options={{ title: 'New Job' }}
          />
          <Stack.Screen
            name="AdminAssignVisit"
            component={AdminAssignVisitScreen}
            options={{ title: 'Assign Visit' }}
          />
        </>
      )}
      {isDev && (
        <Stack.Screen
          name="ComponentGallery"
          component={ComponentGalleryScreen}
          options={{ title: 'Component Gallery' }}
        />
      )}
    </Stack.Navigator>
  );
}
