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

// Launches the camera or photo library, then copies the picked image into
// this app's persistent document directory (so it survives independently of
// the OS's temp/cache cleanup) and returns the resulting local file URI —
// or null if the user cancelled or denied permission.
export async function capturePhoto(source) {
  const permission =
    source === 'camera'
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) return null;

  const result =
    source === 'camera'
      ? await ImagePicker.launchCameraAsync({ quality: 0.6 })
      : await ImagePicker.launchImageLibraryAsync({ quality: 0.6 });
  if (result.canceled) return null;

  const asset = result.assets[0];
  const destFile = new File(photosDir(), `${uuidv4()}.jpg`);
  await new File(asset.uri).copy(destFile);
  return destFile.uri;
}
