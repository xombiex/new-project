export type PickedPhoto = { data: ArrayBuffer | Blob; contentType: string };

const MAX_SIDE = 1600;

function chooseFile(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/jpeg,image/png,image/webp';
    input.onchange = () => resolve(input.files?.[0] ?? null);
    // Closing the file dialog without choosing fires this in current browsers.
    input.oncancel = () => resolve(null);
    input.click();
  });
}

/**
 * Let the person choose one photo, redrawn at most 1600 px on its long side. Redrawing also drops
 * anything stored inside the file, such as where it was taken. Null when they back out.
 */
export async function pickPhoto(): Promise<PickedPhoto | null> {
  const file = await chooseFile();
  if (!file) return null;
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error("That file isn't a picture this browser can open.");
  }
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.82));
  if (!blob) throw new Error("Couldn't prepare that photo.");
  return { data: blob, contentType: 'image/jpeg' };
}
