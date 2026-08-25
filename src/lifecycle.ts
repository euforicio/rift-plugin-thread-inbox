/**
 * The settled / snoozed lifecycle, as pure functions over stored rows.
 *
 * This state lives in the PLUGIN's own database, never on bb's thread. That
 * keeps a plugin concept out of bb's schema and out of the host-daemon
 * protocol, and uninstalling the plugin takes its state with it.
 */

export interface ThreadLifecycleRow {
  threadId: string;
  /** When the user settled it; null when it is active. */
  settledAt: number | null;
  /** Wake time for a snooze; null when it is not snoozed. */
  snoozedUntil: number | null;
  /** When the snooze was set — used to detect activity since. */
  snoozedAt: number | null;
}

/** The activity signals that outrank a user's parking decision. */
export interface ThreadActivitySignals {
  hasPendingInteraction: boolean;
  /** Any live work: runtime, workflows, background agents, plan, goals. */
  isWorking: boolean;
  isUnread: boolean;
  /** Newest attention timestamp bb reports for the thread. */
  latestAttentionAt: number;
}

export type ThreadShelf = "active" | "snoozed" | "settled";
export type WakeReason = "timer" | "attention";

export function resolveWakeReason(
  row: ThreadLifecycleRow | undefined,
  signals: ThreadActivitySignals,
  now: number,
): WakeReason | null {
  if (row?.snoozedUntil === null || row?.snoozedUntil === undefined) return null;
  const wokeOnAttention =
    signals.hasPendingInteraction ||
    (row.snoozedAt !== null && signals.latestAttentionAt > row.snoozedAt);
  if (wokeOnAttention) return "attention";
  return row.snoozedUntil <= now ? "timer" : null;
}

/**
 * Whether a thread may be parked at all.
 *
 * bb has more kinds of live work than a single session status — workflows,
 * background agents, background commands, plan mode, goals — and every one of
 * them must block parking. Hiding a thread that is still working is the one
 * failure this feature cannot afford.
 */
export function canPark(signals: ThreadActivitySignals): boolean {
  return !signals.hasPendingInteraction && !signals.isWorking;
}

/**
 * Which shelf a thread belongs on right now.
 *
 * Order matters. Live work and a raised hand always win, so a parked thread
 * that starts working or asks a question comes straight back. Then snooze,
 * because a wake time is a stronger statement than a settle. Then settled.
 */
export function resolveShelf(
  row: ThreadLifecycleRow | undefined,
  signals: ThreadActivitySignals,
  now: number,
): ThreadShelf {
  if (row === undefined) return "active";
  if (!canPark(signals)) return "active";

  if (row.snoozedUntil !== null) {
    // A timer that has elapsed wakes the thread; so does anything that
    // happened after the snooze was set.
    if (resolveWakeReason(row, signals, now) === null) return "snoozed";
    return "active";
  }

  if (row.settledAt !== null) {
    // New attention since the settle un-settles it: the thread has more to
    // say than it did when the user filed it away.
    if (signals.latestAttentionAt > row.settledAt) return "active";
    return "settled";
  }

  return "active";
}

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

/**
 * Compact "wakes in" label: "5m", "2h", "3d". Minutes round up so a snooze
 * never reads "0m" while the thread is still hidden.
 */
export function snoozeWakeLabel(snoozedUntil: number, now: number): string {
  const remaining = snoozedUntil - now;
  if (remaining <= 0) return "Woken";
  if (remaining < HOUR_MS) {
    return `${Math.max(1, Math.ceil(remaining / MINUTE_MS))}m`;
  }
  if (remaining < DAY_MS) return `${Math.ceil(remaining / HOUR_MS)}h`;
  return `${Math.ceil(remaining / DAY_MS)}d`;
}

export type SnoozePresetId = "30m" | "2h" | "1d" | "1w";

export interface SnoozePreset {
  id: SnoozePresetId;
  label: string;
  snoozedUntil: number;
}

/** The compact duration presets used by BB Sidebar. */
export function resolveSnoozePresets(now: Date): SnoozePreset[] {
  return [
    {
      id: "30m",
      label: "30 minutes",
      snoozedUntil: now.getTime() + 30 * MINUTE_MS,
    },
    { id: "2h", label: "2 hours", snoozedUntil: now.getTime() + 2 * HOUR_MS },
    { id: "1d", label: "1 day", snoozedUntil: now.getTime() + DAY_MS },
    { id: "1w", label: "1 week", snoozedUntil: now.getTime() + 7 * DAY_MS },
  ];
}

/**
 * `setTimeout` delays are signed 32-bit: a far-future wake overflows and fires
 * immediately, which turns one snooze into a tight re-arm loop. Clamped, the
 * timer simply re-arms every ~24.8 days until the wake is in range.
 */
export const MAX_TIMEOUT_MS = 2_147_483_647;

export function nextWakeDelayMs(
  snoozedUntilValues: readonly number[],
  now: number,
): number | null {
  const upcoming = snoozedUntilValues.filter((value) => value > now);
  if (upcoming.length === 0) return null;
  const soonest = Math.min(...upcoming);
  return Math.min(Math.max(0, soonest - now) + 50, MAX_TIMEOUT_MS);
}
