// Turns a picture the user chooses into a small data: address that can be saved inside the exam.
// Browser-only (FileReader, <canvas>), so it lives with the UI; tests replace it.

const MAX_SIDE = 640; // pixels: plenty for a flashcard, small enough to keep the database small
const JPEG_QUALITY = 0.72;
const MAX_FILE_BYTES = 15 * 1024 * 1024;

const readAsDataUrl = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') resolve(reader.result);
      else reject(new Error('Could not read that file.'));
    };
    reader.onerror = () => { reject(new Error('Could not read that file.')); };
    reader.readAsDataURL(file);
  });

const loadImage = (url: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => { resolve(image); };
    image.onerror = () => { reject(new Error('That file is not a picture the app can open.')); };
    image.src = url;
  });

/** Reads an image file and returns it scaled down (longest side 640 px) as a JPEG data: URL. */
export async function fileToDataUrl(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('That file is not an image.');
  if (file.size > MAX_FILE_BYTES) throw new Error('That image is too large (over 15 MB).');

  const image = await loadImage(await readAsDataUrl(file));
  const scale = Math.min(1, MAX_SIDE / Math.max(image.naturalWidth, image.naturalHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Could not process that image.');
  context.fillStyle = '#ffffff'; // JPEG has no transparency
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', JPEG_QUALITY);
}
