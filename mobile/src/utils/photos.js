import * as ImagePicker from 'expo-image-picker';
import { File, Directory, Paths } from 'expo-file-system';
import { uuidv4 } from './uuid';

function photosDir() {
  const dir = new Directory(Paths.document, 'completion-photos');
  if (!dir.exists) {
    dir.create({ idempotent: true });
  }
  return dir;
}

// Launches the camera or photo library, then copies every picked image into
// this app's persistent document directory (so they survive independently
// of the OS's temp/cache cleanup) and returns the resulting local file URIs
// as an array — empty if the user cancelled or denied permission.
//
// The camera only ever captures one photo per launch (that's a platform
// limitation, not a choice here). The library supports picking several at
// once — capped at 10 per launch (selectionLimit below); raise it if that's
// too low for how a completion actually gets used.
export async function capturePhotos(source) {
  const permission =
    source === 'camera'
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) return [];

  const result =
    source === 'camera'
      ? await ImagePicker.launchCameraAsync({ quality: 0.6 })
      : await ImagePicker.launchImageLibraryAsync({
          quality: 0.6,
          allowsMultipleSelection: true,
          selectionLimit: 10,
        });
  if (result.canceled) return [];

  const uris = [];
  for (const asset of result.assets) {
    const destFile = new File(photosDir(), `${uuidv4()}.jpg`);
    await new File(asset.uri).copy(destFile);
    uris.push(destFile.uri);
  }
  return uris;
}
