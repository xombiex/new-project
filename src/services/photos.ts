import * as ImagePicker from 'expo-image-picker';

export type PickedPhoto = { data: ArrayBuffer | Blob; contentType: string };

/**
 * Let the person choose one photo from their library, already shrunk for sharing. Null when they
 * back out. Throws with a readable message when the library can't be opened.
 */
export async function pickPhoto(): Promise<PickedPhoto | null> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) throw new Error('Convoy needs access to your photos to add one. You can allow it in Settings.');
  // No location data leaves the phone with the picture: exif is off.
  const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [4, 3], quality: 0.5, exif: false });
  const asset = result.canceled ? null : result.assets[0];
  if (!asset) return null;
  const data = await (await fetch(asset.uri)).arrayBuffer();
  return { data, contentType: 'image/jpeg' };
}
