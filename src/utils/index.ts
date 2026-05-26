export { timeAgo } from "./time";
export { formatStudentName } from "./display";

export function parseCourseLimit(val: unknown): number {
  if (val == null) return 0;
  if (typeof val === "number") return val;
  if (typeof val === "object" && val !== null && "limit" in val) {
    return Number((val as { limit: unknown }).limit) || 0;
  }
  return Number(val) || 0;
}

export const BASE = import.meta.env.BASE_URL || "/";

export function playDing() {
  try { const a = new Audio(`${BASE}ding.wav`); a.play(); } catch {}
}
export function playBeep() {
  try { const a = new Audio(`${BASE}wrongbeep.wav`); a.play(); } catch {}
}
