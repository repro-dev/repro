import { NodeType, Snapshot } from "@repro/domain";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { RecordingDataAccessor } from "../../../types";
import { executeTool } from "../index";
import { makeAccessor, runFuture } from "./helpers";

function makeBoxedNode(node: Record<string, unknown>) {
  return {
    match: (fn: (n: unknown) => boolean) => fn(node),
    apply: (fn: (n: unknown) => void) => fn(node),
    get: (key: string) => ({
      orElse: (fallback: unknown) =>
        (node as Record<string, unknown>)[key] ?? fallback,
      map: (fn: (v: unknown) => unknown) => ({
        orElse: (fb: unknown) => {
          const val = (node as Record<string, unknown>)[key];
          return val != null ? fn(val) : fb;
        },
      }),
    }),
  };
}

function makeVTree(message: string) {
  const nodes: Record<string, unknown> = {
    doc: {
      type: NodeType.Document,
      id: "doc",
      parentId: null,
      children: ["root"],
    },
    root: {
      type: NodeType.Element,
      id: "root",
      parentId: "doc",
      tagName: "main",
      children: ["text"],
      attributes: { role: "main" },
      properties: { value: null, checked: null, selectedIndex: null },
      shadowRoot: false,
    },
    text: {
      type: NodeType.Text,
      id: "text",
      parentId: "root",
      value: message,
    },
  };

  const boxedNodes: Record<string, unknown> = {};
  for (const [id, node] of Object.entries(nodes)) {
    boxedNodes[id] = makeBoxedNode(node as Record<string, unknown>);
  }

  return { rootId: "doc", nodes: boxedNodes };
}

function makeSnapshot(
  message: string,
  interaction: NonNullable<Snapshot["interaction"]>,
): Snapshot {
  return {
    dom: makeVTree(message),
    interaction,
  } as unknown as Snapshot;
}

function makeAccessorWithSnapshots(
  before: Snapshot | null,
  after: Snapshot | null,
): RecordingDataAccessor {
  return makeAccessor([], 10000, (timestampMs: number) => {
    if (timestampMs === 1000) return before;
    if (timestampMs === 2000) return after;
    return null;
  });
}

describe("compareDOMAtTimes input validation", () => {
  it("returns an error when t1Ms is missing", async () => {
    const accessor = makeAccessor([], 10000, () => null);
    const result = (await runFuture(
      executeTool(accessor, "compareDOMAtTimes", { t2Ms: 2000 }),
    )) as Record<string, unknown>;

    assert.ok("error" in result);
    assert.ok(
      (result["suggestion"] as string).includes("getRecordingDuration"),
    );
  });

  it("returns an error when t2Ms is missing", async () => {
    const accessor = makeAccessor([], 10000, () => null);
    const result = (await runFuture(
      executeTool(accessor, "compareDOMAtTimes", { t1Ms: 1000 }),
    )) as Record<string, unknown>;

    assert.ok("error" in result);
    assert.ok(
      (result["suggestion"] as string).includes("getRecordingDuration"),
    );
  });
});

describe("compareDOMAtTimes snapshot validation", () => {
  it("returns a structured error when interaction metadata is missing", async () => {
    const snapshot = makeSnapshot(
      "before",
      null as unknown as NonNullable<Snapshot["interaction"]>,
    );
    const accessor = makeAccessorWithSnapshots(snapshot, snapshot);
    const result = (await runFuture(
      executeTool(accessor, "compareDOMAtTimes", { t1Ms: 1000, t2Ms: 2000 }),
    )) as Record<string, unknown>;

    assert.ok("error" in result);
    assert.match(String(result["error"]), /interaction metadata/i);
    assert.match(String(result["suggestion"]), /getEvents/i);
  });

  it("returns a structured error when a snapshot is missing", async () => {
    const snapshot = makeSnapshot("before", {
      pageURL: "https://example.com/before",
      viewport: [1280, 720],
    } as NonNullable<Snapshot["interaction"]>);
    const accessor = makeAccessorWithSnapshots(snapshot, null);
    const result = (await runFuture(
      executeTool(accessor, "compareDOMAtTimes", { t1Ms: 1000, t2Ms: 2000 }),
    )) as Record<string, unknown>;

    assert.ok("error" in result);
    assert.match(String(result["error"]), /No DOM snapshot available/);
  });
});

describe("compareDOMAtTimes happy path", () => {
  it("returns concrete pageURL and viewport values plus diff changes", async () => {
    const before = makeSnapshot("hello", {
      pageURL: "https://example.com/before",
      viewport: [1280, 720],
    } as NonNullable<Snapshot["interaction"]>);
    const after = makeSnapshot("goodbye", {
      pageURL: "https://example.com/after",
      viewport: [1024, 768],
    } as NonNullable<Snapshot["interaction"]>);

    const accessor = makeAccessorWithSnapshots(before, after);
    const result = (await runFuture(
      executeTool(accessor, "compareDOMAtTimes", { t1Ms: 1000, t2Ms: 2000 }),
    )) as Record<string, unknown>;

    assert.ok(!("error" in result));
    assert.deepEqual(result["pageURL"], {
      before: "https://example.com/before",
      after: "https://example.com/after",
    });
    assert.deepEqual(result["viewport"], {
      before: { width: 1280, height: 720 },
      after: { width: 1024, height: 768 },
    });

    const changes = result["changes"] as Array<Record<string, unknown>>;
    assert.ok(Array.isArray(changes));
    assert.ok(changes.length > 0);
    assert.equal(result["omittedCount"], 0);
    assert.equal(result["_tokenEstimate"] !== undefined, true);
  });
});
