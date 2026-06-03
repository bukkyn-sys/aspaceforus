const MAX_BYTES = 15 * 1024 * 1024; // 15 MB — generous (phone photos / HEIC)

/** Returns an error string, or null if the file is acceptable. */
export function validateImage(file: File): string | null {
  // Accept any image the browser reports (JPEG/PNG/WebP/HEIC/etc). Some platforms
  // report an empty type for camera/raw files — allow those through rather than
  // blocking real photos; the upload/crop step handles whatever it can decode.
  if (file.type && !file.type.toLowerCase().startsWith("image/")) {
    return "please choose an image file";
  }
  if (file.size > MAX_BYTES) {
    return "photo must be under 15 MB";
  }
  return null;
}
