import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { StorageOperation, StorageType } from "@repro/domain";
import { Box } from "@repro/tdl";
import { SourceEventType } from "@repro/domain";
import { SourceEventView } from "@repro/domain";
import { executeTool, tools } from "./index";
import {
  makeAccessor,
  makeEmptyAccessor,
  runFuture,
} from "./__tests__/helpers";

// ─── Storage event factory ─────────────────────────────────────────────────

function makeStorageEvent(
  time: number,
  storageType: StorageType,
  operation: StorageOperation,
  key: string | null,
  oldValue: string | null,
  newValue: string | null,
): ReturnType<typeof SourceEventView.from> {
  // Bypass SourceEventView.from() — see helpers.ts for rationale.
  return new Box({
    type: SourceEventType.Storage,
    time,
    data: {
      storageType,
      operation,
      key,
      oldValue,
      newValue,
      frameId: 0,
    },
  }) as unknown as ReturnType<typeof SourceEventView.from>;
}

// ─── Tests ────────────────────────────────────────────────────────────────

describe("tools array — getStorageChanges", () => {
  it("includes getStorageChanges tool definition", () => {
    const def = tools.find(
      (t) =>
        (t as { function: { name: string } }).function.name ===
        "getStorageChanges",
    );
    assert.ok(def !== undefined);
  });

  it("includes storageType parameter with localStorage/sessionStorage enum", () => {
    const def = tools.find(
      (t) =>
        (t as { function: { name: string } }).function.name ===
        "getStorageChanges",
    ) as {
      function: {
        parameters: { properties: Record<string, { enum?: string[] }> };
      };
    };
    assert.ok(def !== undefined);
    assert.deepStrictEqual(
      def.function.parameters.properties["storageType"]!.enum,
      ["localStorage", "sessionStorage"],
    );
  });
});

describe("executeTool — getStorageChanges — storageType filter", () => {
  it("returns only localStorage changes when storageType=localStorage", async () => {
    const events = [
      makeStorageEvent(
        100,
        StorageType.localStorage,
        StorageOperation.setItem,
        "foo",
        null,
        "bar",
      ),
      makeStorageEvent(
        200,
        StorageType.sessionStorage,
        StorageOperation.setItem,
        "baz",
        null,
        "qux",
      ),
    ];
    const accessor = makeAccessor(events);
    const result = (await runFuture(
      executeTool(accessor, "getStorageChanges", {
        storageType: "localStorage",
      }),
    )) as { changes: Array<{ storageType: string }>; total: number };

    assert.strictEqual(result.changes.length, 1);
    assert.strictEqual(result.changes[0]!.storageType, "localStorage");
    assert.strictEqual(result.total, 1);
  });

  it("returns only sessionStorage changes when storageType=sessionStorage", async () => {
    const events = [
      makeStorageEvent(
        100,
        StorageType.localStorage,
        StorageOperation.setItem,
        "foo",
        null,
        "bar",
      ),
      makeStorageEvent(
        200,
        StorageType.sessionStorage,
        StorageOperation.setItem,
        "baz",
        null,
        "qux",
      ),
    ];
    const accessor = makeAccessor(events);
    const result = (await runFuture(
      executeTool(accessor, "getStorageChanges", {
        storageType: "sessionStorage",
      }),
    )) as { changes: Array<{ storageType: string }>; total: number };

    assert.strictEqual(result.changes.length, 1);
    assert.strictEqual(result.changes[0]!.storageType, "sessionStorage");
    assert.strictEqual(result.total, 1);
  });

  it("returns all changes when storageType is not provided", async () => {
    const events = [
      makeStorageEvent(
        100,
        StorageType.localStorage,
        StorageOperation.setItem,
        "foo",
        null,
        "bar",
      ),
      makeStorageEvent(
        200,
        StorageType.sessionStorage,
        StorageOperation.setItem,
        "baz",
        null,
        "qux",
      ),
    ];
    const accessor = makeAccessor(events);
    const result = (await runFuture(
      executeTool(accessor, "getStorageChanges", {}),
    )) as { changes: Array<{ storageType: string }>; total: number };

    assert.strictEqual(result.changes.length, 2);
    assert.strictEqual(result.total, 2);
  });
});

describe("executeTool — getStorageChanges — key filter", () => {
  it("filters by exact key match", async () => {
    const events = [
      makeStorageEvent(
        100,
        StorageType.localStorage,
        StorageOperation.setItem,
        "authToken",
        null,
        "abc",
      ),
      makeStorageEvent(
        200,
        StorageType.localStorage,
        StorageOperation.setItem,
        "userPrefs",
        null,
        "{}",
      ),
    ];
    const accessor = makeAccessor(events);
    const result = (await runFuture(
      executeTool(accessor, "getStorageChanges", { key: "authToken" }),
    )) as { changes: Array<{ key: string | null }>; total: number };

    assert.strictEqual(result.changes.length, 1);
    assert.strictEqual(result.changes[0]!.key, "authToken");
  });

  it("filters by key substring match", async () => {
    const events = [
      makeStorageEvent(
        100,
        StorageType.localStorage,
        StorageOperation.setItem,
        "authToken",
        null,
        "abc",
      ),
      makeStorageEvent(
        200,
        StorageType.localStorage,
        StorageOperation.setItem,
        "authRefresh",
        null,
        "xyz",
      ),
      makeStorageEvent(
        300,
        StorageType.localStorage,
        StorageOperation.setItem,
        "userPrefs",
        null,
        "{}",
      ),
    ];
    const accessor = makeAccessor(events);
    const result = (await runFuture(
      executeTool(accessor, "getStorageChanges", { key: "auth" }),
    )) as { changes: Array<{ key: string | null }>; total: number };

    assert.strictEqual(result.changes.length, 2);
    assert.strictEqual(result.total, 2);
  });

  it("excludes events with null key when key filter is provided", async () => {
    const events = [
      makeStorageEvent(
        100,
        StorageType.localStorage,
        StorageOperation.clear,
        null,
        null,
        null,
      ),
      makeStorageEvent(
        200,
        StorageType.localStorage,
        StorageOperation.setItem,
        "authToken",
        null,
        "abc",
      ),
    ];
    const accessor = makeAccessor(events);
    const result = (await runFuture(
      executeTool(accessor, "getStorageChanges", { key: "auth" }),
    )) as { changes: Array<{ key: string | null }>; total: number };

    assert.strictEqual(result.changes.length, 1);
    assert.strictEqual(result.changes[0]!.key, "authToken");
  });
});

describe("executeTool — getStorageChanges — time range filter", () => {
  it("filters by startTime", async () => {
    const events = [
      makeStorageEvent(
        100,
        StorageType.localStorage,
        StorageOperation.setItem,
        "a",
        null,
        "1",
      ),
      makeStorageEvent(
        500,
        StorageType.localStorage,
        StorageOperation.setItem,
        "b",
        null,
        "2",
      ),
      makeStorageEvent(
        900,
        StorageType.localStorage,
        StorageOperation.setItem,
        "c",
        null,
        "3",
      ),
    ];
    const accessor = makeAccessor(events);
    const result = (await runFuture(
      executeTool(accessor, "getStorageChanges", { startTime: 400 }),
    )) as { changes: Array<{ time: number }>; total: number };

    assert.strictEqual(result.changes.length, 2);
    assert.strictEqual(result.changes[0]!.time, 500);
    assert.strictEqual(result.changes[1]!.time, 900);
  });

  it("filters by endTime", async () => {
    const events = [
      makeStorageEvent(
        100,
        StorageType.localStorage,
        StorageOperation.setItem,
        "a",
        null,
        "1",
      ),
      makeStorageEvent(
        500,
        StorageType.localStorage,
        StorageOperation.setItem,
        "b",
        null,
        "2",
      ),
      makeStorageEvent(
        900,
        StorageType.localStorage,
        StorageOperation.setItem,
        "c",
        null,
        "3",
      ),
    ];
    const accessor = makeAccessor(events);
    const result = (await runFuture(
      executeTool(accessor, "getStorageChanges", { endTime: 600 }),
    )) as { changes: Array<{ time: number }>; total: number };

    assert.strictEqual(result.changes.length, 2);
    assert.strictEqual(result.changes[0]!.time, 100);
    assert.strictEqual(result.changes[1]!.time, 500);
  });

  it("filters by both startTime and endTime", async () => {
    const events = [
      makeStorageEvent(
        100,
        StorageType.localStorage,
        StorageOperation.setItem,
        "a",
        null,
        "1",
      ),
      makeStorageEvent(
        500,
        StorageType.localStorage,
        StorageOperation.setItem,
        "b",
        null,
        "2",
      ),
      makeStorageEvent(
        900,
        StorageType.localStorage,
        StorageOperation.setItem,
        "c",
        null,
        "3",
      ),
    ];
    const accessor = makeAccessor(events);
    const result = (await runFuture(
      executeTool(accessor, "getStorageChanges", {
        startTime: 400,
        endTime: 800,
      }),
    )) as { changes: Array<{ time: number }>; total: number };

    assert.strictEqual(result.changes.length, 1);
    assert.strictEqual(result.changes[0]!.time, 500);
  });
});

describe("executeTool — getStorageChanges — value truncation", () => {
  it("truncates individual values longer than 2 KB", async () => {
    const longValue = "x".repeat(3000);
    const events = [
      makeStorageEvent(
        100,
        StorageType.localStorage,
        StorageOperation.setItem,
        "bigKey",
        null,
        longValue,
      ),
    ];
    const accessor = makeAccessor(events);
    const result = (await runFuture(
      executeTool(accessor, "getStorageChanges", {}),
    )) as {
      changes: Array<{ newValue: string | null; _valueTruncated?: boolean }>;
      total: number;
    };

    assert.strictEqual(result.changes.length, 1);
    const change = result.changes[0]!;
    assert.ok(change.newValue !== null);
    // 2048 chars + ellipsis marker: value should be truncated
    assert.ok(
      change.newValue!.length <= 2049,
      `Expected truncated value, got length ${change.newValue!.length}`,
    );
    assert.ok(
      change._valueTruncated === true,
      "Expected _valueTruncated to be true",
    );
  });

  it("does not truncate values at or below 2 KB", async () => {
    const shortValue = "x".repeat(2048);
    const events = [
      makeStorageEvent(
        100,
        StorageType.localStorage,
        StorageOperation.setItem,
        "key",
        null,
        shortValue,
      ),
    ];
    const accessor = makeAccessor(events);
    const result = (await runFuture(
      executeTool(accessor, "getStorageChanges", {}),
    )) as {
      changes: Array<{ newValue: string | null; _valueTruncated?: boolean }>;
      total: number;
    };

    assert.strictEqual(result.changes.length, 1);
    const change = result.changes[0]!;
    assert.strictEqual(change.newValue, shortValue);
    assert.ok(change._valueTruncated !== true);
  });

  it("also truncates oldValue longer than 2 KB", async () => {
    const longOldValue = "o".repeat(3000);
    const events = [
      makeStorageEvent(
        100,
        StorageType.localStorage,
        StorageOperation.setItem,
        "key",
        longOldValue,
        "newVal",
      ),
    ];
    const accessor = makeAccessor(events);
    const result = (await runFuture(
      executeTool(accessor, "getStorageChanges", {}),
    )) as {
      changes: Array<{ oldValue: string | null; _valueTruncated?: boolean }>;
      total: number;
    };

    assert.strictEqual(result.changes.length, 1);
    const change = result.changes[0]!;
    assert.ok(change.oldValue !== null);
    assert.ok(change.oldValue!.length <= 2049);
    assert.ok(change._valueTruncated === true);
  });
});

describe("executeTool — getStorageChanges — error handling", () => {
  it("returns error response with all 3 fields when accessor throws", async () => {
    const throwingAccessor = {
      getDuration: () => 0,
      getSnapshotAtTime: () => null,
      getResourceMap: () => ({}),
      getEventsByType: () => {
        throw new Error("accessor exploded");
      },
      getEventsInRange: () => {
        throw new Error("accessor exploded");
      },
    };
    const result = (await runFuture(
      executeTool(throwingAccessor, "getStorageChanges", {}),
    )) as { error: string; reason: string; suggestion: string };

    assert.ok(typeof result.error === "string", "error field must be a string");
    assert.ok(
      typeof result.reason === "string",
      "reason field must be a string",
    );
    assert.ok(
      typeof result.suggestion === "string",
      "suggestion field must be a string",
    );
  });
});

describe("executeTool — getStorageChanges — result shape", () => {
  it("returns expected fields for a setItem operation", async () => {
    const events = [
      makeStorageEvent(
        300,
        StorageType.localStorage,
        StorageOperation.setItem,
        "myKey",
        "oldVal",
        "newVal",
      ),
    ];
    const accessor = makeAccessor(events);
    const result = (await runFuture(
      executeTool(accessor, "getStorageChanges", {}),
    )) as {
      changes: Array<{
        time: number;
        storageType: string;
        operation: string;
        key: string | null;
        oldValue: string | null;
        newValue: string | null;
      }>;
      total: number;
      _tokenEstimate: number;
    };

    assert.strictEqual(result.changes.length, 1);
    const change = result.changes[0]!;
    assert.strictEqual(change.time, 300);
    assert.strictEqual(change.storageType, "localStorage");
    assert.strictEqual(change.operation, "setItem");
    assert.strictEqual(change.key, "myKey");
    assert.strictEqual(change.oldValue, "oldVal");
    assert.strictEqual(change.newValue, "newVal");
    assert.strictEqual(result.total, 1);
    assert.ok(typeof result._tokenEstimate === "number");
  });

  it("returns correct operation name for removeItem", async () => {
    const events = [
      makeStorageEvent(
        100,
        StorageType.localStorage,
        StorageOperation.removeItem,
        "k",
        "v",
        null,
      ),
    ];
    const accessor = makeAccessor(events);
    const result = (await runFuture(
      executeTool(accessor, "getStorageChanges", {}),
    )) as { changes: Array<{ operation: string }> };

    assert.strictEqual(result.changes[0]!.operation, "removeItem");
  });

  it("returns correct operation name for clear", async () => {
    const events = [
      makeStorageEvent(
        100,
        StorageType.localStorage,
        StorageOperation.clear,
        null,
        null,
        null,
      ),
    ];
    const accessor = makeAccessor(events);
    const result = (await runFuture(
      executeTool(accessor, "getStorageChanges", {}),
    )) as { changes: Array<{ operation: string }> };

    assert.strictEqual(result.changes[0]!.operation, "clear");
  });

  it("returns empty array for empty event list", async () => {
    const accessor = makeEmptyAccessor();
    const result = (await runFuture(
      executeTool(accessor, "getStorageChanges", {}),
    )) as { changes: unknown[]; total: number; _tokenEstimate: number };

    assert.deepStrictEqual(result.changes, []);
    assert.strictEqual(result.total, 0);
    assert.ok(typeof result._tokenEstimate === "number");
  });

  it("returns _hint when results are empty and filters were provided", async () => {
    const accessor = makeEmptyAccessor();
    const result = (await runFuture(
      executeTool(accessor, "getStorageChanges", {
        storageType: "localStorage",
      }),
    )) as { changes: unknown[]; _hint?: string };

    assert.strictEqual(result.changes.length, 0);
    assert.ok(result._hint);
    assert.ok(result._hint.includes("getStorageChanges"));
  });

  it("does not return _hint when no filters were provided and results are empty", async () => {
    const accessor = makeEmptyAccessor();
    const result = (await runFuture(
      executeTool(accessor, "getStorageChanges", {}),
    )) as { changes: unknown[]; _hint?: string };

    assert.strictEqual(result.changes.length, 0);
    assert.strictEqual(result._hint, undefined);
  });

  it("respects limit parameter", async () => {
    const events = Array.from({ length: 10 }, (_, i) =>
      makeStorageEvent(
        i * 100,
        StorageType.localStorage,
        StorageOperation.setItem,
        `key${i}`,
        null,
        `val${i}`,
      ),
    );
    const accessor = makeAccessor(events);
    const result = (await runFuture(
      executeTool(accessor, "getStorageChanges", { limit: 3 }),
    )) as { changes: unknown[]; total: number };

    assert.strictEqual(result.changes.length, 3);
  });
});
