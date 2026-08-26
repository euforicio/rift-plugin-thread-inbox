import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { type PluginSidebarThread, useRealtime, useRealtimeConnectionState, useRpc } from "@get-bb/plugin-sdk/app";
import type { threadInboxRpcContract } from "./server";
import { orderThreads, type ThreadOrderShelf } from "./thread-order";

export function useThreadOrder(
  shelf: ThreadOrderShelf,
  baseThreads: readonly PluginSidebarThread[],
) {
  const rpc = useRpc<typeof threadInboxRpcContract>();
  const realtimeState = useRealtimeConnectionState();
  const [storedIds, setStoredIds] = useState<readonly string[] | null>(null);
  const [optimisticIds, setOptimisticIds] = useState<readonly string[] | null>(null);
  const [storedRevision, setStoredRevision] = useState(0);
  const [isReordering, setIsReordering] = useState(false);
  const inFlight = useRef(false);
  const requestSeq = useRef(0);

  const refresh = useCallback(async () => {
    const seq = ++requestSeq.current;
    try {
      const result = await rpc.call("listThreadOrder", { shelf });
      if (seq !== requestSeq.current) return;
      setStoredIds(result.threadIds);
      setStoredRevision(result.revision);
    } catch {
      // Newest-first remains usable while the backend reloads.
    }
  }, [rpc, shelf]);

  useEffect(() => void refresh(), [refresh, realtimeState]);
  useRealtime("thread-order", () => void refresh());

  const threads = useMemo(
    () => orderThreads(baseThreads, optimisticIds ?? storedIds),
    [baseThreads, optimisticIds, storedIds],
  );
  const ids = threads.map((thread) => thread.id);

  const reorder = useCallback(
    async (nextIds: readonly string[]) => {
      if (storedIds === null || inFlight.current || nextIds.join("\0") === ids.join("\0")) return false;
      // Invalidate reads that began before this mutation. A final refresh
      // below is authoritative and supersedes any reconnect/realtime read
      // that raced the write.
      ++requestSeq.current;
      inFlight.current = true;
      setIsReordering(true);
      setOptimisticIds([...nextIds]);
      try {
        const result = await rpc.call("reorderThreads", {
          shelf,
          threadIds: [...nextIds],
          expectedRevision: storedRevision,
        });
        setStoredIds(result.threadIds);
        setStoredRevision(result.revision);
        await refresh();
        setOptimisticIds(null);
        return result.applied;
      } catch {
        setOptimisticIds(null);
        return false;
      } finally {
        inFlight.current = false;
        setIsReordering(false);
      }
    },
    [ids, refresh, rpc, shelf, storedIds, storedRevision],
  );

  return { threads, ids, isReordering: isReordering || storedIds === null, reorder };
}
