import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import HomeScreen from '../screens/HomeScreen';

const Stack = createNativeStackNavigator();

// Future screens (clock in/out, job selection, timesheet) get added here as
// their backend routes come online — see mobile/README or the architecture
// doc for the planned flow.
export default function AppStack() {
  return (
    <Stack.Navigator>
      <Stack.Screen name="Home" component={HomeScreen} options={{ title: 'CC-I Tech App' }} />
    </Stack.Navigator>
  );
}
