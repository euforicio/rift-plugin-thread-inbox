// bb-plugin-thread-inbox backend — the settled / snoozed store.
//
// This state lives in the plugin's own SQLite database, never on bb's thread.
// Putting it on the thread would mean a schema change, a wire change, and a
// HOST_DAEMON_PROTOCOL_VERSION bump for something only this sidebar
// understands. Here, uninstalling the plugin removes its state with it.
import { defineRpcContract, type RiftPluginApi } from "@riftlabs/plugin-sdk";
import { z } from "zod";

const migrations = [
  `CREATE TABLE IF NOT EXISTS thread_lifecycle (
     thread_id      TEXT PRIMARY KEY,
     settled_at     INTEGER,
     snoozed_until  INTEGER,
     snoozed_at     INTEGER
   )`,
  `CREATE TABLE IF NOT EXISTS thread_order (
     shelf      TEXT NOT NULL,
     thread_id  TEXT NOT NULL,
     position   INTEGER NOT NULL,
     PRIMARY KEY (shelf, thread_id)
   )`,
  `CREATE TABLE IF NOT EXISTS sidebar_settings (
     singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
     inactive_threads_enabled INTEGER NOT NULL,
     inactive_after_hours INTEGER NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS thread_order_revision (
     shelf TEXT PRIMARY KEY,
     revision INTEGER NOT NULL
   )`,
];

export interface StoredLifecycleRow {
  threadId: string;
  settledAt: number | null;
  snoozedUntil: number | null;
  snoozedAt: number | null;
}

interface LifecycleDbRow {
  thread_id: string;
  settled_at: number | null;
  snoozed_until: number | null;
  snoozed_at: number | null;
}

const threadIdSchema = z.object({ threadId: z.string().trim().min(1) });
const threadOrderShelfSchema = z.enum(["pinned", "inbox"]);
const gitStateSchema = z.enum([
  "clean",
  "untracked",
  "dirty_uncommitted",
  "committed_unmerged",
  "dirty_and_committed_unmerged",
]);
type GitState = z.infer<typeof gitStateSchema>;

export const threadInboxRpcContract = defineRpcContract({
  listLifecycle: {
    input: z.object({}),
    output: z.object({
      rows: z.array(
        z.object({
          threadId: z.string(),
          settledAt: z.number().nullable(),
          snoozedUntil: z.number().nullable(),
          snoozedAt: z.number().nullable(),
        }),
      ),
    }),
  },
  settle: { input: threadIdSchema, output: z.object({ ok: z.boolean() }) },
  unsettle: { input: threadIdSchema, output: z.object({ ok: z.boolean() }) },
  snooze: {
    input: z.object({
      threadId: z.string().trim().min(1),
      // Absolute wake time, so a snooze means the same thing on every device.
      snoozedUntil: z.number().int().positive(),
    }),
    output: z.object({ ok: z.boolean() }),
  },
  unsnooze: { input: threadIdSchema, output: z.object({ ok: z.boolean() }) },
  acknowledgeWake: {
    input: z.object({ threadId: z.string().trim().min(1), expectedSnoozedAt: z.number().int().positive() }),
    output: z.object({ applied: z.boolean() }),
  },
  getSidebarSettings: {
    input: z.object({}),
    output: z.object({ inactiveThreadsEnabled: z.boolean(), inactiveAfterHours: z.number().int() }),
  },
  updateSidebarSettings: {
    input: z.object({ inactiveThreadsEnabled: z.boolean(), inactiveAfterHours: z.number().int().min(1).max(720) }),
    output: z.object({ inactiveThreadsEnabled: z.boolean(), inactiveAfterHours: z.number().int() }),
  },
  listEnvironmentGitStates: {
    input: z.object({ environmentIds: z.array(z.string().min(1)).max(200) }),
    output: z.object({ states: z.array(z.object({ environmentId: z.string(), state: gitStateSchema.nullable() })) }),
  },
  listThreadOrder: {
    input: z.object({ shelf: threadOrderShelfSchema }).strict(),
    output: z.object({ threadIds: z.array(z.string()), revision: z.number().int().nonnegative() }).strict(),
  },
  reorderThreads: {
    input: z
      .object({
        shelf: threadOrderShelfSchema,
        threadIds: z.array(z.string().trim().min(1)).max(10_000),
        expectedRevision: z.number().int().nonnegative(),
      })
      .strict(),
    output: z.object({ threadIds: z.array(z.string()), revision: z.number().int().nonnegative(), applied: z.boolean() }).strict(),
  },
});

/** Channel the frontend re-reads on. */
export const LIFECYCLE_CHANNEL = "lifecycle";

export default function plugin(bb: RiftPluginApi) {
  const db = bb.storage.database();
  bb.storage.migrate(db, migrations);
  const readSettings = () => {
    const row = db.prepare(`SELECT inactive_threads_enabled, inactive_after_hours FROM sidebar_settings WHERE singleton = 1`).get() as { inactive_threads_enabled: number; inactive_after_hours: number } | undefined;
    return row ? { inactiveThreadsEnabled: row.inactive_threads_enabled === 1, inactiveAfterHours: row.inactive_after_hours } : { inactiveThreadsEnabled: false, inactiveAfterHours: 6 };
  };
  const gitStateCache = new Map<
    string,
    { state: GitState | null; expiresAt: number }
  >();
  const gitStateInFlight = new Map<string, Promise<GitState | null>>();
  const gitStateGeneration = new Map<string, number>();
  let gitStateEpoch = 0;
  let activeGitStatusReads = 0;
  const gitStatusWaiters: Array<() => void> = [];
  const withGitStatusSlot = async <T>(task: () => Promise<T>): Promise<T> => {
    if (activeGitStatusReads >= 4) {
      await new Promise<void>((resolve) => gitStatusWaiters.push(resolve));
    }
    ++activeGitStatusReads;
    try {
      return await task();
    } finally {
      --activeGitStatusReads;
      gitStatusWaiters.shift()?.();
    }
  };
  const readGitState = (environmentId: string): Promise<GitState | null> => {
    const cached = gitStateCache.get(environmentId);
    if (cached && cached.expiresAt > Date.now()) return Promise.resolve(cached.state);
    const existing = gitStateInFlight.get(environmentId);
    if (existing) return existing;
    const epoch = gitStateEpoch;
    const generation = gitStateGeneration.get(environmentId) ?? 0;
    const request = (async () => {
      try {
        const status = await withGitStatusSlot(() =>
          bb.sdk.environments.status({ environmentId }),
        );
        return status.outcome === "available"
          ? status.workspace.workingTree.state
          : null;
      } catch {
        return null;
      }
    })().then(async (state) => {
      const isCurrent =
        epoch === gitStateEpoch &&
        generation === (gitStateGeneration.get(environmentId) ?? 0);
      if (gitStateInFlight.get(environmentId) === request) {
        gitStateInFlight.delete(environmentId);
      }
      if (!isCurrent) return readGitState(environmentId);
      gitStateCache.set(environmentId, {
        state,
        expiresAt: Date.now() + 30_000,
      });
      return state;
    });
    gitStateInFlight.set(environmentId, request);
    return request;
  };
  const unsubscribeGitStateInvalidation = bb.sdk.subscribe({
    event: "environment:changed",
    callback: (event) => {
      if (event.id) {
        gitStateCache.delete(event.id);
        gitStateInFlight.delete(event.id);
        gitStateGeneration.set(
          event.id,
          (gitStateGeneration.get(event.id) ?? 0) + 1,
        );
      } else {
        ++gitStateEpoch;
        gitStateCache.clear();
        gitStateInFlight.clear();
      }
    },
  });
  bb.onDispose(unsubscribeGitStateInvalidation);

  const readAll = (): StoredLifecycleRow[] =>
    (
      db
        .prepare(
          `SELECT thread_id, settled_at, snoozed_until, snoozed_at
             FROM thread_lifecycle`,
        )
        .all() as LifecycleDbRow[]
    ).map((row) => ({
      threadId: row.thread_id,
      settledAt: row.settled_at,
      snoozedUntil: row.snoozed_until,
      snoozedAt: row.snoozed_at,
    }));

  const write = (row: StoredLifecycleRow): void => {
    db.prepare(
      `INSERT INTO thread_lifecycle
         (thread_id, settled_at, snoozed_until, snoozed_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(thread_id) DO UPDATE SET
         settled_at = excluded.settled_at,
         snoozed_until = excluded.snoozed_until,
         snoozed_at = excluded.snoozed_at`,
    ).run(row.threadId, row.settledAt, row.snoozedUntil, row.snoozedAt);
    bb.realtime.publish(LIFECYCLE_CHANNEL, { threadId: row.threadId });
  };

  const clear = (threadId: string): void => {
    db.prepare(`DELETE FROM thread_lifecycle WHERE thread_id = ?`).run(
      threadId,
    );
    bb.realtime.publish(LIFECYCLE_CHANNEL, { threadId });
  };

  bb.rpc.register(threadInboxRpcContract, {
    async listLifecycle() {
      return { rows: readAll() };
    },
    async settle({ threadId }) {
      // Settling clears any snooze: they are two answers to the same
      // question, and holding both would make the shelf order ambiguous.
      write({
        threadId,
        settledAt: Date.now(),
        snoozedUntil: null,
        snoozedAt: null,
      });
      return { ok: true };
    },
    async unsettle({ threadId }) {
      clear(threadId);
      return { ok: true };
    },
    async snooze({ threadId, snoozedUntil }) {
      const now = Date.now();
      write({
        threadId,
        settledAt: null,
        snoozedUntil,
        snoozedAt: now,
      });
      return { ok: true };
    },
    async unsnooze({ threadId }) {
      clear(threadId);
      return { ok: true };
    },
    async acknowledgeWake({ threadId, expectedSnoozedAt }) {
      const result = db.prepare(
        `DELETE FROM thread_lifecycle WHERE thread_id = ? AND snoozed_at = ?`,
      ).run(threadId, expectedSnoozedAt);
      if (result.changes > 0) bb.realtime.publish(LIFECYCLE_CHANNEL, { threadId });
      return { applied: result.changes > 0 };
    },
    async getSidebarSettings() { return readSettings(); },
    async updateSidebarSettings(values) {
      db.prepare(`INSERT INTO sidebar_settings (singleton, inactive_threads_enabled, inactive_after_hours) VALUES (1, ?, ?) ON CONFLICT(singleton) DO UPDATE SET inactive_threads_enabled = excluded.inactive_threads_enabled, inactive_after_hours = excluded.inactive_after_hours`).run(values.inactiveThreadsEnabled ? 1 : 0, values.inactiveAfterHours);
      bb.realtime.publish("sidebar-settings", {});
      return readSettings();
    },
    async listEnvironmentGitStates({ environmentIds }) {
      const uniqueIds = [...new Set(environmentIds)];
      const states: Array<{ environmentId: string; state: GitState | null }> = [];
      let nextIndex = 0;
      const worker = async () => {
        while (nextIndex < uniqueIds.length) {
          const environmentId = uniqueIds[nextIndex++];
          if (!environmentId) continue;
          states.push({ environmentId, state: await readGitState(environmentId) });
        }
      };
      await Promise.all(
        Array.from({ length: Math.min(4, uniqueIds.length) }, () => worker()),
      );
      return { states };
    },
    async listThreadOrder({ shelf }) {
      const rows = db
        .prepare(
          `SELECT thread_id FROM thread_order WHERE shelf = ? ORDER BY position`,
        )
        .all(shelf) as Array<{ thread_id: string }>;
      const revisionRow = db.prepare(`SELECT revision FROM thread_order_revision WHERE shelf = ?`).get(shelf) as { revision: number } | undefined;
      return { threadIds: rows.map((row) => row.thread_id), revision: revisionRow?.revision ?? 0 };
    },
    async reorderThreads({ shelf, threadIds, expectedRevision }) {
      const replace = db.transaction((ids: readonly string[]) => {
        const revisionRow = db.prepare(`SELECT revision FROM thread_order_revision WHERE shelf = ?`).get(shelf) as { revision: number } | undefined;
        const revision = revisionRow?.revision ?? 0;
        if (revision !== expectedRevision) return { applied: false, revision };
        db.prepare(`DELETE FROM thread_order WHERE shelf = ?`).run(shelf);
        const insert = db.prepare(
          `INSERT INTO thread_order (shelf, thread_id, position) VALUES (?, ?, ?)`,
        );
        ids.forEach((threadId, position) => insert.run(shelf, threadId, position));
        const nextRevision = revision + 1;
        db.prepare(`INSERT INTO thread_order_revision (shelf, revision) VALUES (?, ?) ON CONFLICT(shelf) DO UPDATE SET revision = excluded.revision`).run(shelf, nextRevision);
        return { applied: true, revision: nextRevision };
      });
      const uniqueIds = [...new Set(threadIds)];
      const result = replace(uniqueIds);
      if (result.applied) bb.realtime.publish("thread-order", { shelf });
      if (!result.applied) {
        const rows = db.prepare(`SELECT thread_id FROM thread_order WHERE shelf = ? ORDER BY position`).all(shelf) as Array<{ thread_id: string }>;
        return { threadIds: rows.map((row) => row.thread_id), revision: result.revision, applied: false };
      }
      return { threadIds: uniqueIds, revision: result.revision, applied: true };
    },
  });

  // A deleted thread must not leave a row behind that would park a future
  // thread reusing the id, and stale rows accumulate otherwise.
  bb.events.on("thread.deleted", ({ thread }) => {
    clear(thread.id);
    db.prepare(`DELETE FROM thread_order WHERE thread_id = ?`).run(thread.id);
  });
}
