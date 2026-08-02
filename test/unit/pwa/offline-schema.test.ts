/**
 * PWA-08 — the offline schema ladder.
 *
 * IndexedDB structures can only be created inside a `versionchange` transaction,
 * and a step that has shipped will never run again on a device that already ran
 * it. So the ladder's shape is a correctness property, not a style preference,
 * and it is asserted here: contiguous versions, no duplicates, no gaps, ending
 * exactly at the version the running release opens with.
 *
 * The steps are then applied against a small fake `IDBDatabase` — enough to prove
 * the stores and indexes a fresh install gets, and that a re-run is a no-op. The
 * REAL IndexedDB behaviour (upgrade, interrupted upgrade, recovery, persistence)
 * is exercised end-to-end in a real browser by `e2e/pwa-offline.spec.ts`; a fake
 * cannot honestly stand in for that, so it does not pretend to.
 */

import { describe, expect, it } from "vitest";

import {
  OFFLINE_DATABASE_NAME,
  OFFLINE_DATABASE_VERSION,
  OFFLINE_INDEXES,
  OFFLINE_SCHEMA_STEPS,
  OFFLINE_STORES,
  recordKey,
  stepsFor,
} from "~/kernel/offline";

/** A minimal stand-in for the parts of IndexedDB a schema step touches. */
function fakeDatabase() {
  const stores = new Map<
    string,
    {
      keyPath: string;
      indexes: Map<string, { keyPath: unknown; unique: boolean }>;
    }
  >();
  const database = {
    objectStoreNames: {
      contains: (name: string) => stores.has(name),
    },
    createObjectStore(name: string, options: { keyPath: string }) {
      if (stores.has(name)) {
        throw new Error(`ConstraintError: ${name} already exists`);
      }
      const store = { keyPath: options.keyPath, indexes: new Map() };
      stores.set(name, store);
      return {
        createIndex(
          indexName: string,
          keyPath: unknown,
          indexOptions?: { unique?: boolean },
        ) {
          store.indexes.set(indexName, {
            keyPath,
            unique: indexOptions?.unique ?? false,
          });
        },
      };
    },
  } as unknown as IDBDatabase;
  return { database, stores };
}

describe("the ladder's shape", () => {
  it("is contiguous from 1, with no duplicate or missing version", () => {
    const versions = OFFLINE_SCHEMA_STEPS.map((step) => step.version);
    expect(versions).toEqual(
      Array.from({ length: versions.length }, (_, index) => index + 1),
    );
  });

  it("ends exactly at the version the running release opens the database with", () => {
    const last = OFFLINE_SCHEMA_STEPS[OFFLINE_SCHEMA_STEPS.length - 1];
    expect(last.version).toBe(OFFLINE_DATABASE_VERSION);
  });

  it("describes every step, so a future reader knows what it did", () => {
    for (const step of OFFLINE_SCHEMA_STEPS) {
      expect(step.description.length).toBeGreaterThan(10);
    }
  });
});

describe("stepsFor", () => {
  it("runs every step for a FIRST installation (oldVersion 0)", () => {
    expect(stepsFor(0).map((step) => step.version)).toEqual(
      OFFLINE_SCHEMA_STEPS.map((step) => step.version),
    );
  });

  it("runs nothing when the database is already current", () => {
    expect(stepsFor(OFFLINE_DATABASE_VERSION)).toEqual([]);
  });

  it("runs only the steps above the stored version, in order", () => {
    const steps = stepsFor(0, 1);
    expect(steps.map((step) => step.version)).toEqual([1]);
  });

  it("runs nothing when the stored version is NEWER than this release", () => {
    // A newer database is refused by IndexedDB itself; the ladder must not try
    // to "downgrade" it by re-running steps.
    expect(stepsFor(OFFLINE_DATABASE_VERSION + 5)).toEqual([]);
  });
});

describe("a first installation", () => {
  it("creates the metadata, records and queue stores with their indexes", () => {
    const { database, stores } = fakeDatabase();
    for (const step of stepsFor(0)) {
      step.apply(database, {} as IDBTransaction);
    }

    expect([...stores.keys()].sort()).toEqual(
      [
        OFFLINE_STORES.meta,
        OFFLINE_STORES.queue,
        OFFLINE_STORES.records,
      ].sort(),
    );

    const records = stores.get(OFFLINE_STORES.records)!;
    expect(records.keyPath).toBe("key");
    expect(
      records.indexes.get(OFFLINE_INDEXES.recordsByNamespace)?.keyPath,
    ).toBe("namespace");
    expect(
      records.indexes.get(OFFLINE_INDEXES.recordsByNamespaceKind)?.keyPath,
    ).toEqual(["namespace", "kind"]);

    const queue = stores.get(OFFLINE_STORES.queue)!;
    expect(queue.keyPath).toBe("id");
    expect(queue.indexes.get(OFFLINE_INDEXES.queueByNamespace)?.keyPath).toBe(
      "namespace",
    );
    expect(
      queue.indexes.get(OFFLINE_INDEXES.queueByNamespaceStatus)?.keyPath,
    ).toEqual(["namespace", "status"]);

    expect(stores.get(OFFLINE_STORES.meta)!.keyPath).toBe("namespace");
  });

  it("is idempotent — re-applying a step over an existing store does not throw", () => {
    // This is what protects a device whose upgrade was interrupted after the
    // stores were created but before the transaction committed.
    const { database } = fakeDatabase();
    for (const step of stepsFor(0)) step.apply(database, {} as IDBTransaction);
    expect(() => {
      for (const step of stepsFor(0))
        step.apply(database, {} as IDBTransaction);
    }).not.toThrow();
  });
});

describe("record keys", () => {
  it("are namespaced, so the same record id in two workspaces cannot collide", () => {
    const a = recordKey("dh1-1-aaaa", "task", "task-1");
    const b = recordKey("dh1-1-bbbb", "task", "task-1");
    expect(a).not.toBe(b);
    expect(a).toBe("dh1-1-aaaa|task|task-1");
  });

  it("keeps the same id in two record kinds apart", () => {
    expect(recordKey("ns", "task", "1")).not.toBe(recordKey("ns", "note", "1"));
  });
});

describe("the database name", () => {
  it("carries no version, so a migration is an upgrade and not a second database", () => {
    expect(OFFLINE_DATABASE_NAME).toBe("dalyhub-offline");
    expect(OFFLINE_DATABASE_NAME).not.toMatch(/\d/);
  });
});
