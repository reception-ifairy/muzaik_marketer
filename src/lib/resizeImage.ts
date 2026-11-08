const MAX_SIDE = 1280;
const QUALITY = 0.85;

/** Phone photos are 3–8 MB; send a JPEG of at most 1280 px on the long side instead (EXIF orientation applied). */
export async function resizeImage(file: File): Promise<Blob> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    throw new Error('Nie mogę odczytać tego zdjęcia — wybierz JPG, PNG albo WebP.');
  }
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Przeglądarka nie pozwala przetworzyć zdjęcia.');
  // JPEG has no transparency; a white background keeps cut-out photos readable.
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', QUALITY));
  if (!blob) throw new Error('Nie udało się przygotować zdjęcia.');
  return blob;
}
