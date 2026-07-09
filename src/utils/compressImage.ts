/**
 * Compress an image `File` so its size stays within `maxBytes`.
 *
 * Files already under the budget are returned untouched. Larger files are
 * re-encoded as JPEG: quality is dropped first, then the longest side is scaled
 * down, until a variant fits the budget. If nothing fits (extreme cases), the
 * smallest variant produced is returned anyway — the backend still validates.
 *
 * Output is always JPEG, so any transparency is flattened onto white.
 */
export async function compressImage(
  file: File,
  maxBytes: number,
): Promise<File> {
  if (file.size <= maxBytes) return file;

  // Respect EXIF orientation so portrait phone photos stay upright.
  const bitmap = await createImageBitmap(file, {
    imageOrientation: "from-image",
  });

  const qualities = [0.85, 0.75, 0.65, 0.55];
  const maxDimensions = [2048, 1600, 1280, 1024, 768];

  let smallest: Blob | null = null;

  try {
    for (const maxDim of maxDimensions) {
      const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
      const width = Math.max(1, Math.round(bitmap.width * scale));
      const height = Math.max(1, Math.round(bitmap.height * scale));

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) break;
      // White backdrop so flattened transparency doesn't turn black.
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(bitmap, 0, 0, width, height);

      for (const quality of qualities) {
        const blob = await canvasToBlob(canvas, quality);
        if (!blob) continue;
        if (!smallest || blob.size < smallest.size) smallest = blob;
        if (blob.size <= maxBytes) return toJpegFile(blob, file.name);
      }
    }
  } finally {
    bitmap.close();
  }

  // Couldn't reach the budget; hand back the best (smallest) attempt.
  return smallest ? toJpegFile(smallest, file.name) : file;
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  quality: number,
): Promise<Blob | null> {
  return new Promise((resolve) =>
    canvas.toBlob((blob) => resolve(blob), "image/jpeg", quality),
  );
}

function toJpegFile(blob: Blob, originalName: string): File {
  const base = originalName.replace(/\.[^/.]+$/, "") || "image";
  return new File([blob], `${base}.jpg`, { type: "image/jpeg" });
}
