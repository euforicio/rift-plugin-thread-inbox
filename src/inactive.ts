export const DEFAULT_INACTIVE_AFTER_HOURS = 6;
const HOUR_MS = 3_600_000;

export function isInactiveThread(
  thread: { createdAt: number; latestAttentionAt: number; updatedAt: number },
  now: number,
  afterHours: number | null,
): boolean {
  if (afterHours === null) return false;
  return Math.max(thread.createdAt, thread.updatedAt, thread.latestAttentionAt) <=
    now - afterHours * HOUR_MS;
}
