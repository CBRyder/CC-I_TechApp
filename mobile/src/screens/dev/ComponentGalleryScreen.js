import React, { useState } from 'react';
import { View } from 'react-native';
import {
  Button,
  Card,
  TextField,
  StatusPill,
  ListRow,
  ScreenContainer,
  SectionHeader,
  EmptyState,
  spacing,
} from '../../ui';

// Not part of the real app flow — a living preview of every building block
// in src/ui/, so you can see what editing theme.js or a component file
// actually looks like without hunting through real screens. Reach it with
// navigation.navigate('ComponentGallery') from anywhere (or make it the
// dev entry point temporarily); delete or keep, it's yours either way.
export default function ComponentGalleryScreen() {
  const [text, setText] = useState('');

  return (
    <ScreenContainer>
      <SectionHeader>Buttons</SectionHeader>
      <View style={{ gap: spacing.sm }}>
        <Button variant="primary" onPress={() => {}}>
          Primary
        </Button>
        <Button variant="secondary" onPress={() => {}}>
          Secondary
        </Button>
        <Button variant="outline" onPress={() => {}}>
          Outline
        </Button>
        <Button variant="danger" onPress={() => {}}>
          Danger
        </Button>
        <Button variant="text" onPress={() => {}}>
          Text
        </Button>
        <Button variant="primary" loading>
          Loading
        </Button>
        <Button variant="primary" disabled>
          Disabled
        </Button>
      </View>

      <SectionHeader>Status Pills</SectionHeader>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
        <StatusPill state="travel" />
        <StatusPill state="work" />
        <StatusPill state="pause" />
        <StatusPill state="pending" />
        <StatusPill state="synced" />
      </View>

      <SectionHeader>Card</SectionHeader>
      <Card>
        <StatusPill state="work" />
        <Button variant="text" onPress={() => {}} style={{ alignSelf: 'flex-start', paddingHorizontal: 0 }}>
          A card is just a bordered container — compose anything inside it.
        </Button>
      </Card>

      <SectionHeader>Text Field</SectionHeader>
      <TextField label="Job number" placeholder="J-1001" value={text} onChangeText={setText} />
      <TextField label="With an error" placeholder="you@example.com" error="That doesn't look right." />

      <SectionHeader>List Row</SectionHeader>
      <Card style={{ padding: 0 }}>
        <ListRow title="HVAC Install" subtitle="J-1001 • 123 Riverside Dr" onPress={() => {}} />
        <ListRow title="Panel Upgrade" subtitle="J-1002 • 45 Main St" onPress={() => {}} />
      </Card>

      <SectionHeader>Empty State</SectionHeader>
      <Card>
        <EmptyState message="Nothing here yet — this is what an empty list looks like." />
      </Card>
    </ScreenContainer>
  );
}
