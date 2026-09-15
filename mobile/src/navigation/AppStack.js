import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import HomeScreen from '../screens/HomeScreen';
import JobSelectionScreen from '../screens/JobSelectionScreen';
import JobDetailScreen from '../screens/JobDetailScreen';
import CompleteJobScreen from '../screens/CompleteJobScreen';
import PartsCategoryScreen from '../screens/parts/PartsCategoryScreen';
import PartsListScreen from '../screens/parts/PartsListScreen';
import ComponentGalleryScreen from '../screens/dev/ComponentGalleryScreen';

const Stack = createNativeStackNavigator();

export default function AppStack() {
  return (
    <Stack.Navigator>
      <Stack.Screen name="Home" component={HomeScreen} options={{ title: 'CC-I Tech App' }} />
      <Stack.Screen
        name="JobSelection"
        component={JobSelectionScreen}
        options={{ title: 'Select a Job' }}
      />
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
        name="PartsCategory"
        component={PartsCategoryScreen}
        options={{ title: 'Parts Used' }}
      />
      <Stack.Screen name="PartsList" component={PartsListScreen} options={{ title: 'Select Part' }} />
      <Stack.Screen
        name="ComponentGallery"
        component={ComponentGalleryScreen}
        options={{ title: 'Component Gallery' }}
      />
    </Stack.Navigator>
  );
}
