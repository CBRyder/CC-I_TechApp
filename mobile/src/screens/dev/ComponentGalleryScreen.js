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
  ClockBanner,
  JobCard,
  VisitCard,
  SegmentedTabs,
  SearchField,
  FAB,
  spacing,
} from '../../ui';

// Not part of the real app flow — a living preview of every building block
// in src/ui/, so you can see what editing theme.js or a component file
// actually looks like without hunting through real screens. Reach it with
// navigation.navigate('ComponentGallery') from anywhere (or make it the
// dev entry point temporarily); delete or keep, it's yours either way.
export default function ComponentGalleryScreen() {
  const [text, setText] = useState('');
  const [clockedIn, setClockedIn] = useState(false);
  const [tab, setTab] = useState('Today');
  const [search, setSearch] = useState('');

  return (
    <ScreenContainer>
      {/* ClockBanner wants to sit edge-to-edge (no side padding) — here
          it's shown inside ScreenContainer's padded area just to preview
          it, but on a real screen you'd usually put it above/outside that
          padding so it spans the full width. */}
      <SectionHeader>Clock Banner</SectionHeader>
      <ClockBanner
        date={new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
        isClockedIn={clockedIn}
        clockedInSince="7:42 AM"
        onClockIn={() => setClockedIn(true)}
        onClockOut={() => setClockedIn(false)}
      />

      <SectionHeader>Segmented Tabs</SectionHeader>
      <SegmentedTabs options={['Past', 'Today', 'Future']} value={tab} onChange={setTab} />

      <SectionHeader>Search Field</SectionHeader>
      <SearchField
        value={search}
        onChangeText={setSearch}
        placeholder="Search Job #, Property, Customer or Address"
      />

      <SectionHeader>Visit Card</SectionHeader>
      <VisitCard
        state="work"
        statusLabel="Working"
        tag="NonBillable"
        title="Daily clock-in & clock-out"
        time="7:00 AM"
        duration="1 hr"
        onPress={() => {}}
      />
      <VisitCard
        state="work"
        statusLabel="Working"
        tag="Install | Job 7488, Visit 2"
        title="Walgreens 7153"
        address="2960 Hope Mills Rd, Fayetteville, NC 28306"
        category="removal / install"
        time="8:00 AM"
        duration="1 hr"
        onPress={() => {}}
      />
      <VisitCard
        state="travel"
        statusLabel="Traveling"
        tag="Install | Job 4298, Visit 1"
        title="Test Plaza"
        time="9:15 AM"
        onPress={() => {}}
      />

      <SectionHeader>Job Card</SectionHeader>
      <JobCard
        job={{ job_number: 'J-1001', name: 'HVAC Install - Riverside Office', address: '123 Riverside Dr' }}
        status="work"
        onPress={() => {}}
      />
      <JobCard
        job={{ job_number: 'J-1002', name: 'Panel Upgrade - Main St Retail', address: '45 Main St' }}
        onPress={() => {}}
      />

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

      {/* FAB is position:absolute against the nearest positioned parent —
          this wrapper just contains it for the preview. On a real screen,
          give it a similar `{ position: 'relative', height }` sibling to
          your ScreenContainer (see FAB.js's comment). */}
      <SectionHeader>FAB</SectionHeader>
      <View style={{ height: 90 }}>
        <FAB onPress={() => {}} />
      </View>
    </ScreenContainer>
  );
}
