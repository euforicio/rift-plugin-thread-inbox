import { useCallback, useEffect, useRef, useState } from "react";
import { useRealtime, useRealtimeConnectionState, useRpc } from "@get-bb/plugin-sdk/app";
import type { threadInboxRpcContract } from "./server";

export function SidebarSettings() {
  const rpc = useRpc<typeof threadInboxRpcContract>();
  const realtimeState = useRealtimeConnectionState();
  const [enabled, setEnabled] = useState(false);
  const [hours, setHours] = useState(6);
  const [saved, setSaved] = useState({ enabled: false, hours: 6 });
  const requestSeq = useRef(0);
  const dirtyRef = useRef(false);
  const [saving, setSaving] = useState(false);
  const load = useCallback(async () => {
    const seq = ++requestSeq.current;
    try {
      const value = await rpc.call("getSidebarSettings", {});
      if (seq !== requestSeq.current) return;
      setSaved({ enabled: value.inactiveThreadsEnabled, hours: value.inactiveAfterHours });
      if (!dirtyRef.current) {
        setEnabled(value.inactiveThreadsEnabled);
        setHours(value.inactiveAfterHours);
      }
    } catch {
      // A reconnect transition will retry without overwriting local defaults.
    }
  }, [rpc]);
  useEffect(() => { void load(); }, [load, realtimeState]);
  useRealtime("sidebar-settings", () => { void load(); });
  const save = async () => {
    if (saving) return;
    setSaving(true);
    const seq = ++requestSeq.current;
    try {
      const value = await rpc.call("updateSidebarSettings", {
        inactiveThreadsEnabled: enabled,
        inactiveAfterHours: hours,
      });
      if (seq !== requestSeq.current) return;
      setSaved({ enabled: value.inactiveThreadsEnabled, hours: value.inactiveAfterHours });
      setEnabled(value.inactiveThreadsEnabled);
      setHours(value.inactiveAfterHours);
    } finally {
      setSaving(false);
    }
  };
  const dirty = enabled !== saved.enabled || hours !== saved.hours;
  dirtyRef.current = dirty;
  return <div className="max-w-2xl space-y-5 pb-4">
    <div>
      <h2 className="text-base font-semibold text-foreground">Inactive shelf</h2>
      <p className="mt-1 text-sm text-muted-foreground">Move quiet, unpinned threads out of the active list. New activity brings them back.</p>
    </div>
    <label className="flex items-center justify-between gap-4 rounded-lg border border-border p-4 text-sm text-foreground">
      Enable inactive shelf
      <input type="checkbox" disabled={saving} checked={enabled} onChange={(event) => setEnabled(event.target.checked)} />
    </label>
    <label className="flex items-center justify-between gap-4 rounded-lg border border-border p-4 text-sm text-foreground">
      Move after
      <span className="flex items-center gap-2"><input aria-label="Hours before inactive" type="number" min={1} max={720} disabled={saving || !enabled} value={hours} onChange={(event) => setHours(Number(event.target.value))} className="h-8 w-20 rounded border border-border bg-background px-2 text-right" /> hours</span>
    </label>
    <button type="button" disabled={saving || !dirty || hours < 1 || hours > 720} onClick={() => void save()} className="rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground disabled:opacity-50">Save</button>
  </div>;
}
