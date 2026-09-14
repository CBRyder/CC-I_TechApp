import React from 'react';
import { useColorScheme } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { PaperProvider, MD3LightTheme, MD3DarkTheme } from 'react-native-paper';
import { AuthProvider } from './src/context/AuthContext';
import { SettingsProvider, useSettings } from './src/context/SettingsContext';
import { TrackingProvider } from './src/context/TrackingContext';
import RootNavigator from './src/navigation/RootNavigator';

// Reads the theme preference (needs SettingsContext) and applies it to
// Paper — has to live below SettingsProvider, which itself needs AuthProvider
// above it (preferences are per-account), so this can't just sit in App().
function ThemedApp() {
  const systemScheme = useColorScheme();
  const { theme } = useSettings();
  const resolvedScheme = theme === 'system' ? systemScheme : theme;
  const paperTheme = resolvedScheme === 'dark' ? MD3DarkTheme : MD3LightTheme;

  return (
    <PaperProvider theme={paperTheme}>
      <TrackingProvider>
        <RootNavigator />
      </TrackingProvider>
    </PaperProvider>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <SettingsProvider>
          <ThemedApp />
        </SettingsProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
