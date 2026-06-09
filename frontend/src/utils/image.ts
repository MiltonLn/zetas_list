// Cap the longest side so the cropper always receives a reasonably sized,
// guaranteed-decodable JPEG (also keeps the uploaded payload small).
const MAX_DIMENSION = 1600;
const UNREADABLE_MESSAGE =
  'No se pudo leer la imagen. Probá con una foto en formato JPG o PNG.';

function looksLikeHeic(file: File): boolean {
  return /image\/hei[cf]/i.test(file.type) || /\.(heic|heif)$/i.test(file.name);
}

// HEIC/HEIF (default iPhone format) can't be decoded by <img>/canvas in
// Chrome/Firefox/Android. Convert it to JPEG on the client, lazily importing
// the (heavy) decoder only when we actually hit a HEIC file. Uses heic-to,
// which bundles a modern libheif that parses recent iPhone HEICs that older
// decoders (e.g. heic2any) reject with "Could not parse HEIF file".
async function convertHeicToJpeg(file: Blob): Promise<Blob> {
  const { heicTo } = await import('heic-to');
  return heicTo({ blob: file, type: 'image/jpeg', quality: 0.92 });
}

function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('decode-failed'));
    img.src = src;
  });
}

async function decodeBlob(
  blob: Blob,
): Promise<{ source: CanvasImageSource; width: number; height: number }> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(blob, {
        imageOrientation: 'from-image',
      } as ImageBitmapOptions);
      return { source: bitmap, width: bitmap.width, height: bitmap.height };
    } catch {
      // Fall through to the <img> path (older Safari, unsupported option, etc.)
    }
  }
  const url = URL.createObjectURL(blob);
  try {
    const img = await loadImageElement(url);
    return { source: img, width: img.naturalWidth, height: img.naturalHeight };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Turns a user-selected file into a clean, downscaled JPEG data URL that any
 * browser can render in the cropper. Handles HEIC (iPhone) via conversion and
 * throws a user-facing Spanish error when the image simply can't be read.
 */
export async function prepareImageForCrop(file: File): Promise<string> {
  let working: Blob = file;
  if (looksLikeHeic(file)) {
    try {
      working = await convertHeicToJpeg(file);
    } catch {
      throw new Error(UNREADABLE_MESSAGE);
    }
  }

  let decoded: { source: CanvasImageSource; width: number; height: number };
  try {
    decoded = await decodeBlob(working);
  } catch {
    // Some HEIC files arrive without a proper type/extension; try converting
    // once more before giving up.
    if (working === file) {
      try {
        working = await convertHeicToJpeg(file);
        decoded = await decodeBlob(working);
      } catch {
        throw new Error(UNREADABLE_MESSAGE);
      }
    } else {
      throw new Error(UNREADABLE_MESSAGE);
    }
  }

  const { source, width, height } = decoded;
  if (!width || !height) throw new Error(UNREADABLE_MESSAGE);

  const scale = Math.min(1, MAX_DIMENSION / Math.max(width, height));
  const targetW = Math.max(1, Math.round(width * scale));
  const targetH = Math.max(1, Math.round(height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error(UNREADABLE_MESSAGE);
  ctx.drawImage(source, 0, 0, targetW, targetH);
  if ('close' in source && typeof source.close === 'function') source.close();

  return canvas.toDataURL('image/jpeg', 0.92);
}
