import { MAX_FILE_SIZE, ALLOWED_IMAGE_TYPES, ALLOWED_RECEIPT_TYPES } from "../constants";

export function validateImageFile(file: File): string | null {
  if (file.size > MAX_FILE_SIZE) return `File too large (max ${MAX_FILE_SIZE / 1024 / 1024}MB)`;
  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) return "Only JPEG, PNG, WebP and GIF images allowed";
  return null;
}

export function validateReceiptFile(file: File): string | null {
  if (file.size > MAX_FILE_SIZE) return `File too large (max ${MAX_FILE_SIZE / 1024 / 1024}MB)`;
  if (!ALLOWED_RECEIPT_TYPES.includes(file.type)) return "Only images and PDFs allowed";
  return null;
}
