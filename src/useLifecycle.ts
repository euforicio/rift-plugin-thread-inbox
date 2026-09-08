import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRealtime, useRealtimeConnectionState, useRpc } from "@riftlabs/plugin-sdk/app";
import type { PluginSidebarThread } from "@riftlabs/plugin-sdk";
import type { threadInboxRpcContract } from "./server";
import {
  canPark,
  nextWakeDelayMs,
  resolveWakeReason,
  resolveShelf,
  type ThreadLifecycleRow,
  type ThreadShelf,
} from "./lifecycle";

/** Any live work at all, which blocks parking and wakes a parked thread. */
export function isWorking(thread: PluginSidebarThread): boolean {
  const { activity } = thread;
  return (
    activity.workflows > 0 ||
    activity.backgroundAgents > 0 ||
    activity.backgroundCommands > 0 ||
    activity.planMode > 0 ||
    activity.goals > 0 ||
    thread.indicator === "runtime" ||
    thread.indicator === "working-draft"
  );
}

export interface LifecycleApi {
  shelfFor(
    thread: PluginSidebarThread,
    descendants?: readonly PluginSidebarThread[],
  ): ThreadShelf;
  canPark(
    thread: PluginSidebarThread,
    descendants?: readonly PluginSidebarThread[],
  ): boolean;
  wakeAtFor(thread: PluginSidebarThread): number | null;
  snoozedAtFor(thread: PluginSidebarThread): number | null;
  wokeFor(
    thread: PluginSidebarThread,
    descendants?: readonly PluginSidebarThread[],
  ): boolean;
  acknowledgeWake(threadId: string, expectedSnoozedAt: number): Promise<void>;
  settle(threadId: string): Promise<void>;
  unsettle(threadId: string): Promise<void>;
  snooze(threadId: string, snoozedUntil: number): Promise<void>;
  unsnooze(threadId: string): Promise<void>;
}

/**
 * Reads the plugin's own lifecycle store and classifies threads onto shelves.
 *
 * `now` is state, not a render-time clock read: a snooze that elapses must
 * move its row without waiting for an unrelated re-render, and re-reading the
 * clock during render would make the classification unstable.
 */
export function useLifecycle(
  threads: readonly PluginSidebarThread[],
): LifecycleApi {
  const rpc = useRpc<typeof threadInboxRpcContract>();
  const realtimeState = useRealtimeConnectionState();
  const [rows, setRows] = useState<ReadonlyMap<string, ThreadLifecycleRow>>(
    () => new Map(),
  );
  const [now, setNow] = useState(() => Date.now());

  // Responses can land out of order (a mutation's refresh racing a realtime
  // one), and an older list would silently restore state the user just
  // changed. Only the newest request may write.
  const requestSeq = useRef(0);
  const refresh = useCallback(async () => {
    const seq = ++requestSeq.current;
    const result = await rpc.call("listLifecycle", {});
    if (seq !== requestSeq.current) return;
    setRows(new Map(result.rows.map((row) => [row.threadId, row])));
  }, [rpc]);

  useEffect(() => {
    void refresh();
  }, [refresh, realtimeState]);

  useRealtime("lifecycle", () => {
    void refresh();
  });

  // Arm one timer for the soonest wake instead of polling: the shelf empties
  // the moment a snooze expires, and nothing ticks while nothing is snoozed.
  useEffect(() => {
    // Read a fresh clock here rather than trusting `now`: `now` is only
    // updated when a timer fires, so arming from it after a long idle period
    // would schedule a new snooze far too late.
    const armedAt = Date.now();
    const delay = nextWakeDelayMs(
      [...rows.values()].flatMap((row) =>
        row.snoozedUntil === null ? [] : [row.snoozedUntil],
      ),
      armedAt,
    );
    if (delay === null) return;
    const timer = setTimeout(() => setNow(Date.now()), delay);
    return () => clearTimeout(timer);
  }, [now, rows]);

  return useMemo<LifecycleApi>(() => {
    const signalsFor = (
      thread: PluginSidebarThread,
      descendants: readonly PluginSidebarThread[] = [],
    ) => {
      const group = [thread, ...descendants];
      return {
        hasPendingInteraction: group.some(
          (candidate) => candidate.hasPendingInteraction,
        ),
        isWorking: group.some(isWorking),
        isUnread: group.some((candidate) => candidate.isUnread),
        latestAttentionAt: Math.max(
          ...group.map((candidate) => candidate.latestAttentionAt),
        ),
      };
    };
    // One read per mutation: the write publishes on the realtime channel, and
    // that subscription already triggers a refresh for every client.
    const mutate = async (
      method: "settle" | "unsettle" | "unsnooze" | "acknowledgeWake",
      threadId: string,
    ) => {
      await rpc.call(method, { threadId });
    };
    return {
      shelfFor: (thread, descendants = []) =>
        resolveShelf(rows.get(thread.id), signalsFor(thread, descendants), now),
      canPark: (thread, descendants = []) =>
        canPark(signalsFor(thread, descendants)),
      wakeAtFor: (thread) => rows.get(thread.id)?.snoozedUntil ?? null,
      snoozedAtFor: (thread) => rows.get(thread.id)?.snoozedAt ?? null,
      wokeFor: (thread, descendants = []) =>
        resolveWakeReason(
          rows.get(thread.id),
          signalsFor(thread, descendants),
          now,
        ) !== null,
      acknowledgeWake: async (threadId, expectedSnoozedAt) => {
        await rpc.call("acknowledgeWake", { threadId, expectedSnoozedAt });
      },
      settle: (threadId) => mutate("settle", threadId),
      unsettle: (threadId) => mutate("unsettle", threadId),
      unsnooze: (threadId) => mutate("unsnooze", threadId),
      snooze: async (threadId, snoozedUntil) => {
        await rpc.call("snooze", { threadId, snoozedUntil });
      },
    };
  }, [now, refresh, rows, rpc]);
}
