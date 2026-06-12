/**
 * Client-side image compression, run just before a photo is PUT to GCS.
 *
 * WHY HERE (not the backend): in prod the browser uploads straight to GCS via a
 * signed PUT URL — the API never sees the bytes — so the only place to shrink a
 * file without a separate post-upload job is right before that PUT. Phone-camera
 * photos are routinely 3–8 MB; resized to ≤1600px and re-encoded as JPEG q0.8
 * they land around ~250 KB, a 10–20× cut that every read (dashboard thumbnails,
 * previews, prints) then benefits from.
 *
 * Implemented with the native canvas pipeline (`createImageBitmap` →
 * `<canvas>` → `toBlob`) — NO new dependency, deliberately, to stay clear of the
 * pnpm-build gate. It is best-effort: any decode/encode failure (HEIC, a corrupt
 * file, an OOM on a huge image) falls back to the ORIGINAL file, and the BE's
 * content-type allow-list still guards what actually gets stored.
 */

export interface CompressOptions {
  /** Longest-edge cap in px; the image is scaled down to fit (never up). */
  maxDimension?: number;
  /** JPEG quality, 0–1. */
  quality?: number;
  /** Files at or below this many bytes skip compression — re-encoding an
   *  already-small image mostly just costs quality for little size win. */
  minBytesToCompress?: number;
}

const DEFAULTS: Required<CompressOptions> = {
  maxDimension: 1600,
  quality: 0.8,
  minBytesToCompress: 200 * 1024, // 200 KB
};

/** Raster inputs we can safely re-encode to JPEG (by MIME or extension). */
const RASTER = /image\/(jpeg|jpg|png|webp)/i;
const RASTER_EXT = /\.(jpe?g|png|webp)$/i;

/**
 * Return a compressed JPEG `File`, or the original `file` unchanged when
 * compression isn't applicable or wouldn't help. Always resolves — never
 * throws — so callers can `await compressImage(file)` inline without a guard.
 */
export async function compressImage(
  file: File,
  options: CompressOptions = {},
): Promise<File> {
  const { maxDimension, quality, minBytesToCompress } = {
    ...DEFAULTS,
    ...options,
  };

  // Only touch raster photos; leave anything else (SVG, HEIC we can't decode,
  // unknown types) to pass through to the BE allow-list untouched.
  const looksRaster = RASTER.test(file.type) || RASTER_EXT.test(file.name);
  if (!looksRaster) return file;
  if (file.size <= minBytesToCompress) return file;

  try {
    // `from-image` bakes in EXIF orientation so portrait phone shots aren't
    // rotated sideways after the canvas re-encode.
    const bitmap = await createImageBitmap(file, {
      imageOrientation: 'from-image',
    });

    const scale = Math.min(
      1,
      maxDimension / Math.max(bitmap.width, bitmap.height),
    );
    const w = Math.round(bitmap.width * scale);
    const h = Math.round(bitmap.height * scale);

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      bitmap.close();
      return file;
    }
    // White matte so transparent PNGs don't flatten to black under JPEG.
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close();

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', quality),
    );
    // If encoding failed or somehow bloated the file (already-optimised JPEG),
    // keep the original — never upload a worse result than we were handed.
    if (!blob || blob.size >= file.size) return file;

    const name = file.name.replace(RASTER_EXT, '') + '.jpg';
    return new File([blob], name, {
      type: 'image/jpeg',
      lastModified: file.lastModified,
    });
  } catch {
    return file;
  }
}
