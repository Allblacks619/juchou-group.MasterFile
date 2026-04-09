/**
 * Upload validation constants and helpers.
 * Shared between client (pre-upload check) and server (final validation).
 */

/** Allowed MIME types */
export const ALLOWED_MIME_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
] as const;

/** Allowed file extensions (lowercase) */
export const ALLOWED_EXTENSIONS = [".pdf", ".jpg", ".jpeg", ".png", ".webp"] as const;

/** Max file size per type (bytes) */
export const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10MB
export const MAX_PDF_SIZE = 20 * 1024 * 1024;   // 20MB

/** Max total upload size per action (bytes) */
export const MAX_TOTAL_SIZE = 40 * 1024 * 1024;  // 40MB

/** Max files per case/action */
export const MAX_FILES_PER_ACTION = 10;

/** MIME type to extension mapping for consistency check */
const MIME_TO_EXTENSIONS: Record<string, string[]> = {
  "application/pdf": [".pdf"],
  "image/jpeg": [".jpg", ".jpeg"],
  "image/jpg": [".jpg", ".jpeg"],
  "image/png": [".png"],
  "image/webp": [".webp"],
};

export interface UploadValidationError {
  field: string;
  message: string;
}

/**
 * Validate a single file before upload.
 * Returns null if valid, or an error message string (Japanese).
 */
export function validateFile(
  fileName: string,
  mimeType: string,
  fileSize: number,
): string | null {
  // Check MIME type
  if (!ALLOWED_MIME_TYPES.includes(mimeType as any)) {
    return `「${fileName}」: 許可されていないファイル形式です。PDF、JPG、JPEG、PNG、WEBPのみアップロード可能です。`;
  }

  // Check extension
  const ext = ("." + fileName.split(".").pop()!).toLowerCase();
  if (!ALLOWED_EXTENSIONS.includes(ext as any)) {
    return `「${fileName}」: 許可されていないファイル拡張子です。PDF、JPG、JPEG、PNG、WEBPのみアップロード可能です。`;
  }

  // Check MIME-extension consistency
  const allowedExts = MIME_TO_EXTENSIONS[mimeType];
  if (allowedExts && !allowedExts.includes(ext)) {
    return `「${fileName}」: ファイル形式と拡張子が一致しません。ファイルが正しいか確認してください。`;
  }

  // Check size limits
  const isPdf = mimeType === "application/pdf";
  const maxSize = isPdf ? MAX_PDF_SIZE : MAX_IMAGE_SIZE;
  const maxLabel = isPdf ? "20MB" : "10MB";
  if (fileSize > maxSize) {
    return `「${fileName}」: ファイルサイズが上限（${maxLabel}）を超えています。`;
  }

  return null;
}

/**
 * Validate a batch of files before upload.
 * Returns an array of error messages (empty if all valid).
 */
export function validateFiles(
  files: Array<{ name: string; mimeType: string; size: number }>,
): string[] {
  const errors: string[] = [];

  // Check file count
  if (files.length > MAX_FILES_PER_ACTION) {
    errors.push(`一度にアップロードできるファイルは最大${MAX_FILES_PER_ACTION}件です。`);
    return errors; // No need to check individual files
  }

  // Check total size
  const totalSize = files.reduce((sum, f) => sum + f.size, 0);
  if (totalSize > MAX_TOTAL_SIZE) {
    errors.push(`合計ファイルサイズが上限（40MB）を超えています。`);
  }

  // Check individual files
  for (const file of files) {
    const err = validateFile(file.name, file.mimeType, file.size);
    if (err) errors.push(err);
  }

  return errors;
}
