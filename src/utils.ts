// src/utils.ts — Shared utilities

// course_limits can be either a plain number or {used, limit} object
// This helper normalizes to just the "limit" (purchased hours) number
export function parseCourseLimit(val: any): number {
  if (val == null) return 0;
  if (typeof val === "number") return val;
  if (typeof val === "object" && val.limit != null) return Number(val.limit) || 0;
  return Number(val) || 0;
}

// Get the base URL for static assets (respects Vite's base config)
export const BASE = import.meta.env.BASE_URL || "/";

// Audio helpers that use correct base path
export function playDing() {
  try { const a = new Audio(`${BASE}ding.wav`); a.play(); } catch {}
}
export function playBeep() {
  try { const a = new Audio(`${BASE}wrongbeep.wav`); a.play(); } catch {}
}
