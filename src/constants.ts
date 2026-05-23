export const POLL = {
  NOTIFICATIONS: 30_000,
  ATTENDANCE_LIVE: 15_000,
} as const;

export const STALE = {
  FAST: 10_000,
  NORMAL: 60_000,
  SLOW: 300_000,
} as const;

export const QUERY_PAGE_SIZE = 50;

export const INACTIVITY_TIMEOUT_MS = 15 * 60 * 1000;
export const INACTIVITY_THROTTLE_MS = 1_000;

export const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
export const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
export const ALLOWED_RECEIPT_TYPES = [...ALLOWED_IMAGE_TYPES, "application/pdf"];
