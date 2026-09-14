import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import HomeScreen from '../screens/HomeScreen';
import CompleteJobScreen from '../screens/CompleteJobScreen';
import PartsCategoryScreen from '../screens/parts/PartsCategoryScreen';
import PartsListScreen from '../screens/parts/PartsListScreen';

const Stack = createNativeStackNavigator();

// Clock in/out and job selection (travel/work/pause) still need their own
// screens — this is next up. Job completion (photos/summary/parts, queued
// by Finish) is built out below.
export default function AppStack() {
  return (
    <Stack.Navigator>
      <Stack.Screen name="Home" component={HomeScreen} options={{ title: 'CC-I Tech App' }} />
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
    </Stack.Navigator>
  );
}
