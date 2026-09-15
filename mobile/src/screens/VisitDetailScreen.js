import React, { useEffect, useState } from 'react';
import { Image, View } from 'react-native';
import { Text, ActivityIndicator } from 'react-native-paper';
import { useTracking } from '../context/TrackingContext';
import { ScreenContainer, SectionHeader, EmptyState } from '../ui';

// Read-only — this visit's completion is already submitted and locked (the
// backend rejects further edits to it), so there's no add/edit/submit here,
// just displaying what was recorded.
export default function VisitDetailScreen({ route }) {
  const { completionClientId } = route.params;
  const { getJobCompletion, getCompletionPhotos, getCompletionParts } = useTracking();

  const [completion, setCompletion] = useState(null);
  const [photos, setPhotos] = useState([]);
  const [parts, setParts] = useState([]);

  useEffect(() => {
    getJobCompletion(completionClientId).then(setCompletion);
    getCompletionPhotos(completionClientId).then(setPhotos);
    getCompletionParts(completionClientId).then(setParts);
  }, [completionClientId]);

  if (!completion) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <ScreenContainer>
      <Text variant="titleLarge">{completion.job_name || 'Job'}</Text>
      {completion.job_number ? <Text variant="bodyMedium">{completion.job_number}</Text> : null}

      <SectionHeader>Notes</SectionHeader>
      <Text>{completion.visit_summary || 'No notes were left for this visit.'}</Text>

      <SectionHeader>Photos</SectionHeader>
      {photos.length === 0 ? (
        <EmptyState message="No photos were added to this visit." />
      ) : (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {photos.map((photo) => (
            <Image
              key={photo.client_id}
              source={{ uri: photo.local_uri }}
              style={{ width: 100, height: 100, borderRadius: 8 }}
            />
          ))}
        </View>
      )}

      <SectionHeader>Parts Used</SectionHeader>
      {parts.length === 0 ? (
        <EmptyState message="No parts were logged for this visit." />
      ) : (
        parts.map((part) => (
          <Text key={part.client_id}>
            {part.quantity}x {part.name} ({part.unit})
          </Text>
        ))
      )}
    </ScreenContainer>
  );
}
