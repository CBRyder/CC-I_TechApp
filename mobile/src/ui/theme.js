import { MD3LightTheme, MD3DarkTheme } from 'react-native-paper';

// CC&I brand colors, pulled from the company logo (deep forest green +
// near-black) — visual estimates, not sampled from an official brand guide,
// so swap in exact hex values if/when there's a source of truth for them.
// Every block in src/ui/ pulls its colors from the Paper theme (via
// useTheme()), so editing here (or stateColors below) restyles everywhere.
const brand = {
  primary: '#2F5F45', // deep forest green — primary actions
  secondary: '#5C8A6E', // lighter tint of the same green — secondary accent
  error: '#E14B3D', // stays a standard red regardless of brand — errors need to read as errors
};

export const lightTheme = {
  ...MD3LightTheme,
  colors: {
    ...MD3LightTheme.colors,
    ...brand,
    background: '#F7F5F2',
  },
};

export const darkTheme = {
  ...MD3DarkTheme,
  colors: {
    ...MD3DarkTheme.colors,
    ...brand,
    background: '#0D0F0D', // near-black, matching the logo's background
  },
};

// Semantic colors for job/sync states (used by StatusPill) — kept separate
// from the Paper theme since there are more of these than Paper's color
// roles cover. Edit freely; StatusPill just looks up state -> color here.
export const stateColors = {
  travel: '#3B82F6',
  work: '#FF6A1A',
  pause: '#C8DA3F',
  pending: '#E14B3D',
  synced: '#3FA34D',
};

export const spacing = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 };
export const radius = { sm: 6, md: 10, lg: 16, pill: 999 };

// Minimum tappable size — matters more here than most apps: techs are
// often wearing gloves or working one-handed. Use this for anything
// tappable that isn't already a full-width button.
export const touchTarget = 48;
