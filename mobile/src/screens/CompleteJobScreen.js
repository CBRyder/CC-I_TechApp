import React, { useCallback, useState } from 'react';
import { Alert, Image, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { ActivityIndicator, Button, IconButton, Text, TextInput } from 'react-native-paper';
import { useTracking } from '../context/TrackingContext';
import { capturePhoto } from '../utils/photos';

// Reached either right after tapping Finish, or later from Home's "Pending
// Completions" list — the time marker (job_segments.ended_at) was already
// recorded the instant Finish was tapped, independent of this screen.
export default function CompleteJobScreen({ route, navigation }) {
  const { completionClientId } = route.params;
  const {
    getJobCompletion,
    getCompletionParts,
    getCompletionPhotos,
    setCompletionSummary,
    removePartFromCompletion,
    addPhotoToCompletion,
    submitCompletion,
  } = useTracking();

  const [completion, setCompletion] = useState(null);
  const [parts, setParts] = useState([]);
  const [beforePhotos, setBeforePhotos] = useState([]);
  const [afterPhotos, setAfterPhotos] = useState([]);
  const [summary, setSummary] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    const c = await getJobCompletion(completionClientId);
    setCompletion(c);
    setSummary(c?.visit_summary || '');
    setParts(await getCompletionParts(completionClientId));
    const photos = await getCompletionPhotos(completionClientId);
    setBeforePhotos(photos.filter((p) => p.kind === 'before'));
    setAfterPhotos(photos.filter((p) => p.kind === 'after'));
  }, [completionClientId, getJobCompletion, getCompletionParts, getCompletionPhotos]);

  // Reloads whenever this screen regains focus — coming back from the parts
  // picker or a photo capture both need to show up here immediately.
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const handleAddPhoto = (kind) => {
    Alert.alert('Add Photo', undefined, [
      { text: 'Take Photo', onPress: () => pickAndAdd('camera', kind) },
      { text: 'Choose from Library', onPress: () => pickAndAdd('library', kind) },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const pickAndAdd = async (source, kind) => {
    const uri = await capturePhoto(source);
    if (!uri) return;
    await addPhotoToCompletion(completionClientId, kind, uri);
    load();
  };

  const handleRemovePart = async (partClientId) => {
    await removePartFromCompletion(partClientId);
    load();
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    await setCompletionSummary(completionClientId, summary);
    await submitCompletion(completionClientId);
    setSubmitting(false);
    navigation.goBack();
  };

  if (!completion) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text variant="titleLarge">{completion.job_name || 'Job'}</Text>
      {completion.job_number ? (
        <Text variant="bodyMedium" style={styles.muted}>
          {completion.job_number}
        </Text>
      ) : null}

      <Text variant="titleMedium" style={styles.sectionTitle}>
        Before Photos
      </Text>
      <PhotoRow photos={beforePhotos} onAdd={() => handleAddPhoto('before')} />

      <Text variant="titleMedium" style={styles.sectionTitle}>
        After Photos
      </Text>
      <PhotoRow photos={afterPhotos} onAdd={() => handleAddPhoto('after')} />

      <Text variant="titleMedium" style={styles.sectionTitle}>
        Visit Summary
      </Text>
      <TextInput
        mode="outlined"
        multiline
        numberOfLines={4}
        value={summary}
        onChangeText={setSummary}
        placeholder="What did you do on this visit?"
        style={styles.summaryInput}
      />

      <Text variant="titleMedium" style={styles.sectionTitle}>
        Parts Used
      </Text>
      {parts.length === 0 ? (
        <Text style={styles.muted}>No parts added yet.</Text>
      ) : (
        parts.map((part) => (
          <View key={part.client_id} style={styles.partRow}>
            <Text style={styles.partText}>
              {part.quantity}x {part.name} ({part.unit})
            </Text>
            <IconButton icon="close" size={18} onPress={() => handleRemovePart(part.client_id)} />
          </View>
        ))
      )}
      <Button
        mode="outlined"
        onPress={() => navigation.navigate('PartsCategory', { completionClientId })}
        style={styles.addPartButton}
      >
        + Add Part
      </Button>

      <Button
        mode="contained"
        onPress={handleSubmit}
        loading={submitting}
        disabled={submitting}
        style={styles.submitButton}
      >
        Submit Completion
      </Button>
    </ScrollView>
  );
}

function PhotoRow({ photos, onAdd }) {
  return (
    <ScrollView horizontal style={styles.photoRow} showsHorizontalScrollIndicator={false}>
      {photos.map((photo) => (
        <Image key={photo.client_id} source={{ uri: photo.local_uri }} style={styles.thumbnail} />
      ))}
      <TouchableOpacity style={styles.addPhotoButton} onPress={onAdd}>
        <Text style={styles.addPhotoText}>+</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  container: { padding: 20, paddingBottom: 48 },
  muted: { opacity: 0.6, marginBottom: 8 },
  sectionTitle: { marginTop: 20, marginBottom: 8 },
  photoRow: { flexDirection: 'row' },
  thumbnail: { width: 72, height: 72, borderRadius: 8, marginRight: 8 },
  addPhotoButton: {
    width: 72,
    height: 72,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#94a3b8',
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },
  addPhotoText: { fontSize: 28, color: '#94a3b8' },
  summaryInput: { minHeight: 100 },
  partRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  partText: { flex: 1 },
  addPartButton: { marginTop: 8 },
  submitButton: { marginTop: 32 },
});
