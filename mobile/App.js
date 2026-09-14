import React from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { PaperProvider } from 'react-native-paper';
import { AuthProvider } from './src/context/AuthContext';
import { TrackingProvider } from './src/context/TrackingContext';
import RootNavigator from './src/navigation/RootNavigator';

export default function App() {
  return (
    <SafeAreaProvider>
      <PaperProvider>
        <AuthProvider>
          <TrackingProvider>
            <RootNavigator />
          </TrackingProvider>
        </AuthProvider>
      </PaperProvider>
    </SafeAreaProvider>
  );
}
