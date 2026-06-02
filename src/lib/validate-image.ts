const ALLOWED_TYPES = new Set([
  "image/jpeg", "image/jpg", "image/png", "image/webp", "image/heic", "image/heif",
]);
const MAX_BYTES = 10 * 1024 * 1024; // 10 MB — generous before cropping

/** Returns an error string, or null if the file is acceptable. */
export function validateImage(file: File): string | null {
  if (!ALLOWED_TYPES.has(file.type.toLowerCase())) {
    return "only JPEG, PNG, or WebP photos are allowed";
  }
  if (file.size > MAX_BYTES) {
    return "photo must be under 10 MB";
  }
  return null;
}
