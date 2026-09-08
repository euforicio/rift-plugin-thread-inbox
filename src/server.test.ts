import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createFakePluginHost,
  makeThreadResponse,
  type FakePluginHost,
} from "@riftlabs/plugin-sdk/testing";
import plugin, { LIFECYCLE_CHANNEL } from "./server";

type LifecycleRow = {
  threadId: string;
  settledAt: number | null;
  snoozedUntil: number | null;
  snoozedAt: number | null;
};

type LifecycleResponse = { rows: LifecycleRow[] };
type OrderResponse = {
  threadIds: string[];
  revision: number;
  applied?: boolean;
};

let host: FakePluginHost | undefined;

const startPlugin = async (): Promise<FakePluginHost> => {
  host = createFakePluginHost({
    pluginId: "thread-inbox-test",
    sdk: { subscribe: () => () => {} },
  });
  await plugin(host.rift);
  return host;
};

const callRpc = <Result>(
  fakeHost: FakePluginHost,
  method: string,
  input: unknown = {},
): Promise<Result> => fakeHost.harness.behavior.callRpc(method, input) as Promise<Result>;

afterEach(async () => {
  vi.useRealTimers();
  await host?.harness.lifecycle.dispose();
  host = undefined;
});

describe("thread inbox server", () => {
  it("persists lifecycle mutations across reload and publishes lifecycle updates", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-03T04:05:06.000Z"));
    let activeHost = await startPlugin();

    await expect(
      callRpc<{ ok: boolean }>(activeHost, "snooze", {
        threadId: "thr_lifecycle",
        snoozedUntil: Date.now() + 60_000,
      }),
    ).resolves.toEqual({ ok: true });
    expect(await callRpc<LifecycleResponse>(activeHost, "listLifecycle")).toEqual({
      rows: [
        {
          threadId: "thr_lifecycle",
          settledAt: null,
          snoozedUntil: Date.now() + 60_000,
          snoozedAt: Date.now(),
        },
      ],
    });
    expect(activeHost.harness.inspection.realtimeSignals).toContainEqual({
      channel: LIFECYCLE_CHANNEL,
      payload: { threadId: "thr_lifecycle" },
    });

    // Reload opens a fresh plugin context over the same temporary SQLite DB.
    activeHost = await activeHost.harness.lifecycle.reload(plugin);
    host = activeHost;
    vi.setSystemTime(new Date("2026-02-03T04:06:06.000Z"));

    await expect(
      callRpc<{ ok: boolean }>(activeHost, "settle", {
        threadId: "thr_lifecycle",
      }),
    ).resolves.toEqual({ ok: true });
    expect(await callRpc<LifecycleResponse>(activeHost, "listLifecycle")).toEqual({
      rows: [
        {
          threadId: "thr_lifecycle",
          settledAt: Date.now(),
          snoozedUntil: null,
          snoozedAt: null,
        },
      ],
    });

    await callRpc<{ ok: boolean }>(activeHost, "unsettle", {
      threadId: "thr_lifecycle",
    });
    expect(await callRpc<LifecycleResponse>(activeHost, "listLifecycle")).toEqual({ rows: [] });

    await callRpc<{ ok: boolean }>(activeHost, "snooze", {
      threadId: "thr_lifecycle",
      snoozedUntil: Date.now() + 60_000,
    });
    await expect(
      callRpc<{ applied: boolean }>(activeHost, "acknowledgeWake", {
        threadId: "thr_lifecycle",
        expectedSnoozedAt: Date.now() - 1,
      }),
    ).resolves.toEqual({ applied: false });
    await expect(
      callRpc<{ applied: boolean }>(activeHost, "acknowledgeWake", {
        threadId: "thr_lifecycle",
        expectedSnoozedAt: Date.now(),
      }),
    ).resolves.toEqual({ applied: true });
    expect(await callRpc<LifecycleResponse>(activeHost, "listLifecycle")).toEqual({ rows: [] });
  });

  it("stores sidebar settings and broadcasts their changes", async () => {
    const activeHost = await startPlugin();

    await expect(callRpc(activeHost, "getSidebarSettings")).resolves.toEqual({
      inactiveThreadsEnabled: false,
      inactiveAfterHours: 6,
    });
    await expect(
      callRpc(activeHost, "updateSidebarSettings", {
        inactiveThreadsEnabled: true,
        inactiveAfterHours: 24,
      }),
    ).resolves.toEqual({ inactiveThreadsEnabled: true, inactiveAfterHours: 24 });
    expect(await callRpc(activeHost, "getSidebarSettings")).toEqual({
      inactiveThreadsEnabled: true,
      inactiveAfterHours: 24,
    });
    expect(activeHost.harness.inspection.realtimeSignals).toContainEqual({
      channel: "sidebar-settings",
      payload: {},
    });
  });

  it("rejects a stale thread-order revision without overwriting the saved order", async () => {
    const activeHost = await startPlugin();

    await expect(
      callRpc<OrderResponse>(activeHost, "reorderThreads", {
        shelf: "inbox",
        threadIds: ["thr_two", "thr_one", "thr_two"],
        expectedRevision: 0,
      }),
    ).resolves.toEqual({
      threadIds: ["thr_two", "thr_one"],
      revision: 1,
      applied: true,
    });
    await expect(
      callRpc<OrderResponse>(activeHost, "reorderThreads", {
        shelf: "inbox",
        threadIds: ["thr_stale"],
        expectedRevision: 0,
      }),
    ).resolves.toEqual({
      threadIds: ["thr_two", "thr_one"],
      revision: 1,
      applied: false,
    });
    await expect(
      callRpc<OrderResponse>(activeHost, "listThreadOrder", { shelf: "inbox" }),
    ).resolves.toEqual({ threadIds: ["thr_two", "thr_one"], revision: 1 });
    expect(
      activeHost.harness.inspection.realtimeSignals.filter(
        ({ channel }) => channel === "thread-order",
      ),
    ).toHaveLength(1);
  });

  it("removes lifecycle and ordering state when a thread is deleted", async () => {
    const activeHost = await startPlugin();

    await callRpc(activeHost, "settle", { threadId: "thr_deleted" });
    await callRpc(activeHost, "reorderThreads", {
      shelf: "pinned",
      threadIds: ["thr_deleted", "thr_other"],
      expectedRevision: 0,
    });
    await callRpc(activeHost, "reorderThreads", {
      shelf: "inbox",
      threadIds: ["thr_other", "thr_deleted"],
      expectedRevision: 0,
    });

    await expect(
      activeHost.harness.behavior.emitThreadEvent("thread.deleted", {
        thread: makeThreadResponse({ id: "thr_deleted" }),
      }),
    ).resolves.toEqual({ errors: [] });
    await expect(callRpc<LifecycleResponse>(activeHost, "listLifecycle")).resolves.toEqual({
      rows: [],
    });
    await expect(
      callRpc<OrderResponse>(activeHost, "listThreadOrder", { shelf: "pinned" }),
    ).resolves.toEqual({ threadIds: ["thr_other"], revision: 1 });
    await expect(
      callRpc<OrderResponse>(activeHost, "listThreadOrder", { shelf: "inbox" }),
    ).resolves.toEqual({ threadIds: ["thr_other"], revision: 1 });
  });
});
