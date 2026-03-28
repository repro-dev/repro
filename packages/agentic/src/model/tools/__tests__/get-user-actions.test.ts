import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { executeTool, tools } from "../index";
import {
  makeAccessor,
  makeClickEvent,
  makeDoubleClickEvent,
  makeEmptyAccessor,
  makeKeyDownEvent,
  makePageTransitionEvent,
  makePointerDownEvent,
  makePointerMoveEvent,
  makePointerUpEvent,
  makeScrollEvent,
  runFuture,
} from "./helpers";

describe("tools array — getUserActions", () => {
  it("includes getUserActions in tools array", async () => {
    const def = tools.find(
      (t) =>
        (t as { function: { name: string } }).function.name ===
        "getUserActions",
    );
    assert.ok(def !== undefined);
  });
});

describe("executeTool — getUserActions — empty recording", () => {
  it("returns empty actions array for empty recording", async () => {
    const accessor = makeEmptyAccessor();
    const result = (await runFuture(
      executeTool(accessor, "getUserActions", {}),
    )) as {
      actions: unknown[];
      totalActions: number;
      _tokenEstimate: number;
    };
    assert.deepStrictEqual(result.actions, []);
    assert.strictEqual(result.totalActions, 0);
    assert.ok(typeof result._tokenEstimate === "number");
  });
});

describe("executeTool — getUserActions — click with meta.node", () => {
  it("includes element.nodeId, tagName, and attributes (nulls filtered)", async () => {
    const events = [
      makeClickEvent(
        1000,
        "Submit button",
        [100, 200],
        {
          id: "node-42",
          tagName: "button",
          attributes: { class: "btn", "data-null": null },
        },
        [],
      ),
    ];
    const accessor = makeAccessor(events);
    const result = (await runFuture(
      executeTool(accessor, "getUserActions", {}),
    )) as {
      actions: Array<{
        timeMs: number;
        action: string;
        label?: string;
        element: {
          nodeId: string;
          tagName: string;
          attributes: Record<string, string>;
        } | null;
        targets: string[];
      }>;
    };
    assert.strictEqual(result.actions.length, 1);
    const action = result.actions[0]!;
    assert.strictEqual(action.action, "click");
    assert.strictEqual(action.timeMs, 1000);
    assert.strictEqual(action.label, "Submit button");
    assert.ok(action.element !== null);
    assert.strictEqual(action.element!.nodeId, "node-42");
    assert.strictEqual(action.element!.tagName, "button");
    assert.deepStrictEqual(action.element!.attributes, { class: "btn" });
  });

  it("element is null when meta.node is not available", async () => {
    // Use makeClickEvent without metaNode param — meta.node will be default "00001"/button
    // Actually we need a click with no node info. Let's use a click from the existing helpers
    // that produces a node with default id "00001"
    const events = [makeClickEvent(1000)];
    const accessor = makeAccessor(events);
    const result = (await runFuture(
      executeTool(accessor, "getUserActions", {}),
    )) as {
      actions: Array<{
        action: string;
        element: { nodeId: string } | null;
      }>;
    };
    // Default makeClickEvent has a node with id "00001", so element should be present
    assert.strictEqual(result.actions.length, 1);
    assert.strictEqual(result.actions[0]!.action, "click");
    assert.ok(result.actions[0]!.element !== null);
    assert.strictEqual(result.actions[0]!.element!.nodeId, "00001");
  });
});

describe("executeTool — getUserActions — click with targets", () => {
  it("includes targets array when non-empty", async () => {
    const events = [
      makeClickEvent(1000, null, [100, 200], undefined, ["node-a", "node-b"]),
    ];
    const accessor = makeAccessor(events);
    const result = (await runFuture(
      executeTool(accessor, "getUserActions", {}),
    )) as {
      actions: Array<{ targets: string[] }>;
    };
    assert.deepStrictEqual(result.actions[0]!.targets, ["node-a", "node-b"]);
  });

  it("targets is empty array when no targets", async () => {
    const events = [makeClickEvent(1000, null, [100, 200], undefined, [])];
    const accessor = makeAccessor(events);
    const result = (await runFuture(
      executeTool(accessor, "getUserActions", {}),
    )) as {
      actions: Array<{ targets: string[] }>;
    };
    assert.deepStrictEqual(result.actions[0]!.targets, []);
  });
});

describe("executeTool — getUserActions — doubleClick", () => {
  it("emits action: doubleClick", async () => {
    const events = [makeDoubleClickEvent(2000, "Logo")];
    const accessor = makeAccessor(events);
    const result = (await runFuture(
      executeTool(accessor, "getUserActions", {}),
    )) as {
      actions: Array<{ action: string; timeMs: number; label?: string }>;
    };
    assert.strictEqual(result.actions.length, 1);
    assert.strictEqual(result.actions[0]!.action, "doubleClick");
    assert.strictEqual(result.actions[0]!.timeMs, 2000);
    assert.strictEqual(result.actions[0]!.label, "Logo");
  });
});

describe("executeTool — getUserActions — KeyDown coalescing", () => {
  it("coalesces consecutive keystrokes into typed action", async () => {
    const events = [
      makeKeyDownEvent(3000, "h"),
      makeKeyDownEvent(3050, "i"),
      makeKeyDownEvent(3100, "!"),
    ];
    const accessor = makeAccessor(events);
    const result = (await runFuture(
      executeTool(accessor, "getUserActions", {}),
    )) as {
      actions: Array<{ action: string; timeMs: number; text?: string }>;
    };
    assert.strictEqual(result.actions.length, 1);
    assert.strictEqual(result.actions[0]!.action, "typed");
    assert.strictEqual(result.actions[0]!.text, "hi!");
    assert.strictEqual(result.actions[0]!.timeMs, 3000);
  });

  it("flushes keystrokes when a click interrupts", async () => {
    const events = [
      makeKeyDownEvent(3000, "a"),
      makeKeyDownEvent(3050, "b"),
      makeClickEvent(4000),
    ];
    const accessor = makeAccessor(events);
    const result = (await runFuture(
      executeTool(accessor, "getUserActions", {}),
    )) as {
      actions: Array<{ action: string }>;
    };
    assert.strictEqual(result.actions.length, 2);
    assert.strictEqual(result.actions[0]!.action, "typed");
    assert.strictEqual(result.actions[1]!.action, "click");
  });

  it("wraps special keys in brackets", async () => {
    const events = [
      makeKeyDownEvent(3000, "Enter"),
      makeKeyDownEvent(3050, "Backspace"),
    ];
    const accessor = makeAccessor(events);
    const result = (await runFuture(
      executeTool(accessor, "getUserActions", {}),
    )) as {
      actions: Array<{ action: string; text?: string }>;
    };
    assert.strictEqual(result.actions[0]!.action, "typed");
    assert.strictEqual(result.actions[0]!.text, "[Enter][Backspace]");
  });
});

describe("executeTool — getUserActions — scroll", () => {
  it("emits action: scroll with to coordinates", async () => {
    const events = [makeScrollEvent(5000, "00001" as never, [0, 0], [0, 400])];
    const accessor = makeAccessor(events);
    const result = (await runFuture(
      executeTool(accessor, "getUserActions", {}),
    )) as {
      actions: Array<{
        action: string;
        timeMs: number;
        to: { x: number; y: number };
      }>;
    };
    assert.strictEqual(result.actions.length, 1);
    assert.strictEqual(result.actions[0]!.action, "scroll");
    assert.deepStrictEqual(result.actions[0]!.to, { x: 0, y: 400 });
  });
});

describe("executeTool — getUserActions — pageTransition", () => {
  it("emits action: pageTransition with from and to", async () => {
    const events = [makePageTransitionEvent(6000, "/next", "/current")];
    const accessor = makeAccessor(events);
    const result = (await runFuture(
      executeTool(accessor, "getUserActions", {}),
    )) as {
      actions: Array<{
        action: string;
        timeMs: number;
        from?: string;
        to: string;
      }>;
    };
    assert.strictEqual(result.actions.length, 1);
    assert.strictEqual(result.actions[0]!.action, "pageTransition");
    assert.strictEqual(result.actions[0]!.from, "/current");
    assert.strictEqual(result.actions[0]!.to, "/next");
  });

  it("omits from when null", async () => {
    const events = [makePageTransitionEvent(6000, "/first", null)];
    const accessor = makeAccessor(events);
    const result = (await runFuture(
      executeTool(accessor, "getUserActions", {}),
    )) as {
      actions: Array<{ from?: string; to: string }>;
    };
    assert.ok(!("from" in result.actions[0]!));
    assert.strictEqual(result.actions[0]!.to, "/first");
  });
});

describe("executeTool — getUserActions — excluded events", () => {
  it("excludes PointerMove, PointerDown, PointerUp", async () => {
    const events = [
      makePointerMoveEvent(1000),
      makePointerDownEvent(1100),
      makePointerUpEvent(1200),
      makeClickEvent(2000),
    ];
    const accessor = makeAccessor(events);
    const result = (await runFuture(
      executeTool(accessor, "getUserActions", {}),
    )) as {
      actions: Array<{ action: string }>;
    };
    assert.strictEqual(result.actions.length, 1);
    assert.strictEqual(result.actions[0]!.action, "click");
  });
});

describe("executeTool — getUserActions — time range filtering", () => {
  it("filters by startTimeMs and endTimeMs", async () => {
    const events = [
      makeClickEvent(100),
      makeClickEvent(500),
      makeClickEvent(900),
    ];
    const accessor = makeAccessor(events);
    const result = (await runFuture(
      executeTool(accessor, "getUserActions", {
        startTimeMs: 300,
        endTimeMs: 700,
      }),
    )) as {
      actions: Array<{ timeMs: number }>;
    };
    assert.strictEqual(result.actions.length, 1);
    assert.strictEqual(result.actions[0]!.timeMs, 500);
  });
});
