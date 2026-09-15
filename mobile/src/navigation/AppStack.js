import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import HomeScreen from '../screens/HomeScreen';
import JobDetailScreen from '../screens/JobDetailScreen';
import CompleteJobScreen from '../screens/CompleteJobScreen';
import VisitDetailScreen from '../screens/VisitDetailScreen';
import PartsCategoryScreen from '../screens/parts/PartsCategoryScreen';
import PartsListScreen from '../screens/parts/PartsListScreen';
import ComponentGalleryScreen from '../screens/dev/ComponentGalleryScreen';
import { useAuth } from '../context/AuthContext';

const Stack = createNativeStackNavigator();

export default function AppStack() {
  // Dev-only tools (ComponentGallery, the data-clear button, etc.) — only
  // registered as a route at all for accounts holding the 'dev' role, same
  // pattern as the 'admin' role gating job assignment. A tech without it
  // has no way to reach this screen, not even by guessing the route name.
  const { user } = useAuth();
  const isDev = user?.roles?.includes('dev');

  return (
    <Stack.Navigator>
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
        name="PartsCategory"
        component={PartsCategoryScreen}
        options={{ title: 'Parts Used' }}
      />
      <Stack.Screen name="PartsList" component={PartsListScreen} options={{ title: 'Select Part' }} />
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
