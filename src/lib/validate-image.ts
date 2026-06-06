const MAX_BYTES = 60 * 1024 * 1024; // 60 MB — roomy for HEIC / ProRAW / large originals

/** Returns an error string, or null if the file is acceptable. */
export function validateImage(file: File): string | null {
  // Accept any image the browser reports (JPEG/PNG/WebP/HEIC/etc). Some platforms
  // report an empty type for camera/raw files — allow those through rather than
  // blocking real photos; the upload/crop step handles whatever it can decode.
  if (file.type && !file.type.toLowerCase().startsWith("image/")) {
    return "please choose an image file";
  }
  if (file.size > MAX_BYTES) {
    return "photo must be under 60 MB";
  }
  return null;
}
