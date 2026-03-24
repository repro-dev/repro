import { NodeType, Snapshot, SourceEvent } from "@repro/domain";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { RecordingDataAccessor } from "../../../types";
import { executeTool, tools } from "../index";

// These helpers use a hand-rolled Box mock because getElementDetails uses
// the vtree node API (get/match/apply) rather than SourceEventView.
function makeVTree(nodes: Record<string, unknown>, rootId: string) {
  const boxedNodes: Record<string, unknown> = {};
  for (const [id, node] of Object.entries(nodes)) {
    boxedNodes[id] = {
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
  return { rootId, nodes: boxedNodes };
}

function makeSnapshot(vtree: unknown): Snapshot {
  return { dom: vtree, interaction: null } as unknown as Snapshot;
}

function makeAccessorWithSnapshot(
  snapshotFn: (timestampMs: number) => Snapshot | null,
): RecordingDataAccessor {
  return {
    getDuration: () => 5000,
    getSnapshotAtTime: snapshotFn,
    getEventsByType: () => [] as Array<SourceEvent>,
    getEventsInRange: () => [] as Array<SourceEvent>,
  };
}

function makeEmptyAccessor(): RecordingDataAccessor {
  return {
    getDuration: () => 0,
    getSnapshotAtTime: () => null,
    getEventsByType: () => [] as Array<SourceEvent>,
    getEventsInRange: () => [] as Array<SourceEvent>,
  };
}

function makeStandardVTree() {
  return makeVTree(
    {
      doc: {
        type: NodeType.Document,
        id: "doc",
        parentId: null,
        children: ["html"],
      },
      html: {
        type: NodeType.Element,
        id: "html",
        parentId: "doc",
        tagName: "html",
        children: ["body"],
        attributes: { lang: "en" },
        properties: { value: null, checked: null, selectedIndex: null },
        shadowRoot: false,
      },
      body: {
        type: NodeType.Element,
        id: "body",
        parentId: "html",
        tagName: "body",
        children: ["div1"],
        attributes: {},
        properties: { value: null, checked: null, selectedIndex: null },
        shadowRoot: false,
      },
      div1: {
        type: NodeType.Element,
        id: "div1",
        parentId: "body",
        tagName: "div",
        children: ["btn1", "span1"],
        attributes: {
          id: "container",
          class: "wrapper flex",
          style: "display:flex",
        },
        properties: { value: null, checked: null, selectedIndex: null },
        shadowRoot: false,
      },
      btn1: {
        type: NodeType.Element,
        id: "btn1",
        parentId: "div1",
        tagName: "button",
        children: ["txt1"],
        attributes: {
          class: "btn-primary",
          "data-testid": "submit-btn",
          disabled: "",
        },
        properties: { value: null, checked: null, selectedIndex: null },
        shadowRoot: false,
      },
      txt1: {
        type: NodeType.Text,
        id: "txt1",
        parentId: "btn1",
        value: "Click me",
      },
      span1: {
        type: NodeType.Element,
        id: "span1",
        parentId: "div1",
        tagName: "span",
        children: ["txt2"],
        attributes: { class: "label" },
        properties: { value: null, checked: null, selectedIndex: null },
        shadowRoot: false,
      },
      txt2: {
        type: NodeType.Text,
        id: "txt2",
        parentId: "span1",
        value: "Hello world",
      },
    },
    "doc",
  );
}

describe("tools array — getElementDetails", () => {
  it("tool definition exists in tools array", () => {
    const found = tools.find(
      (t) => "function" in t && t.function.name === "getElementDetails",
    );
    assert.ok(found !== undefined);
  });
});

describe("executeTool — getElementDetails — errors", () => {
  it("missing nodeId returns error", () => {
    const accessor = makeEmptyAccessor();
    const result = executeTool(accessor, "getElementDetails", {}) as Record<
      string,
      unknown
    >;
    assert.ok("error" in result);
    assert.ok((result["error"] as string).toLowerCase().includes("nodeid"));
  });

  it("missing nodeId returns reason and suggestion mentioning getDOMState", () => {
    const accessor = makeEmptyAccessor();
    const result = executeTool(accessor, "getElementDetails", {}) as Record<
      string,
      unknown
    >;
    assert.ok(result["reason"]);
    assert.ok(result["suggestion"]);
    assert.ok((result["suggestion"] as string).includes("getDOMState"));
  });

  it("missing timestampMs returns error", () => {
    const accessor = makeEmptyAccessor();
    const result = executeTool(accessor, "getElementDetails", {
      nodeId: "x",
    }) as Record<string, unknown>;
    assert.ok("error" in result);
    assert.ok(
      (result["error"] as string).toLowerCase().includes("timestampms"),
    );
  });

  it("missing timestampMs returns reason and suggestion mentioning getRecordingDuration", () => {
    const accessor = makeEmptyAccessor();
    const result = executeTool(accessor, "getElementDetails", {
      nodeId: "x",
    }) as Record<string, unknown>;
    assert.ok(result["reason"]);
    assert.ok(result["suggestion"]);
    assert.ok(
      (result["suggestion"] as string).includes("getRecordingDuration"),
    );
  });

  it("no snapshot returns error", () => {
    const accessor = makeEmptyAccessor();
    const result = executeTool(accessor, "getElementDetails", {
      nodeId: "abc",
      timestampMs: 1000,
    }) as Record<string, unknown>;
    assert.ok("error" in result);
    assert.ok((result["error"] as string).toLowerCase().includes("snapshot"));
  });

  it("no snapshot returns reason and suggestion mentioning getRecordingDuration", () => {
    const accessor = makeEmptyAccessor();
    const result = executeTool(accessor, "getElementDetails", {
      nodeId: "abc",
      timestampMs: 1000,
    }) as Record<string, unknown>;
    assert.ok(result["reason"]);
    assert.ok(result["suggestion"]);
    assert.ok(
      (result["suggestion"] as string).includes("getRecordingDuration"),
    );
  });

  it("node not found returns error containing the nodeId", () => {
    const vtree = makeStandardVTree();
    const accessor = makeAccessorWithSnapshot(() => makeSnapshot(vtree));
    const result = executeTool(accessor, "getElementDetails", {
      nodeId: "zzz99",
      timestampMs: 1000,
    }) as Record<string, unknown>;
    assert.ok("error" in result);
    assert.ok((result["error"] as string).includes("zzz99"));
  });

  it("node not found returns reason and suggestion mentioning getDOMState", () => {
    const vtree = makeStandardVTree();
    const accessor = makeAccessorWithSnapshot(() => makeSnapshot(vtree));
    const result = executeTool(accessor, "getElementDetails", {
      nodeId: "zzz99",
      timestampMs: 1000,
    }) as Record<string, unknown>;
    assert.ok(result["reason"]);
    assert.ok(result["suggestion"]);
    assert.ok((result["suggestion"] as string).includes("getDOMState"));
  });
});

describe("executeTool — getElementDetails — self context", () => {
  it("returns element, parents, siblings, textContent; no children", () => {
    const vtree = makeStandardVTree();
    const accessor = makeAccessorWithSnapshot(() => makeSnapshot(vtree));
    const result = executeTool(accessor, "getElementDetails", {
      nodeId: "btn1",
      timestampMs: 1000,
    }) as Record<string, unknown>;

    const element = result["element"] as Record<string, unknown>;
    assert.strictEqual(element["nodeId"], "btn1");
    assert.strictEqual(element["tagName"], "button");
    assert.ok("class" in (element["attributes"] as Record<string, unknown>));
    assert.ok(
      "data-testid" in (element["attributes"] as Record<string, unknown>),
    );
    assert.ok("disabled" in (element["attributes"] as Record<string, unknown>));

    const parents = result["parents"] as Array<Record<string, unknown>>;
    assert.strictEqual(parents.length, 3);
    assert.strictEqual(parents[0]!["nodeId"], "div1");
    assert.strictEqual(parents[1]!["nodeId"], "body");
    assert.strictEqual(parents[2]!["nodeId"], "html");

    const siblings = result["siblings"] as Array<Record<string, unknown>>;
    assert.strictEqual(siblings.length, 1);
    assert.strictEqual(siblings[0]!["nodeId"], "span1");
    assert.ok(
      "class" in (siblings[0]!["attributes"] as Record<string, unknown>),
    );

    assert.strictEqual(result["textContent"], "Click me");
    assert.strictEqual(result["children"], undefined);
  });
});

describe("executeTool — getElementDetails — subtree context", () => {
  it("includes direct children", () => {
    const vtree = makeStandardVTree();
    const accessor = makeAccessorWithSnapshot(() => makeSnapshot(vtree));
    const result = executeTool(accessor, "getElementDetails", {
      nodeId: "div1",
      timestampMs: 1000,
      context: "subtree",
    }) as Record<string, unknown>;

    const children = result["children"] as Array<Record<string, unknown>>;
    assert.ok(Array.isArray(children));
    assert.strictEqual(children.length, 2);
    const childIds = children.map((c) => c["nodeId"]);
    assert.ok(childIds.includes("btn1"));
    assert.ok(childIds.includes("span1"));
  });
});

describe("executeTool — getElementDetails — ancestry context", () => {
  it("returns full parent chain", () => {
    const vtree = makeStandardVTree();
    const accessor = makeAccessorWithSnapshot(() => makeSnapshot(vtree));
    const result = executeTool(accessor, "getElementDetails", {
      nodeId: "btn1",
      timestampMs: 1000,
      context: "ancestry",
    }) as Record<string, unknown>;

    const parents = result["parents"] as Array<Record<string, unknown>>;
    const parentIds = parents.map((p) => p["nodeId"]);
    assert.ok(parentIds.includes("div1"));
    assert.ok(parentIds.includes("body"));
    assert.ok(parentIds.includes("html"));
  });
});

describe("executeTool — getElementDetails — properties", () => {
  it("includes non-null properties and omits null ones", () => {
    const vtree = makeVTree(
      {
        input1: {
          type: NodeType.Element,
          id: "input1",
          parentId: null,
          tagName: "input",
          children: [],
          attributes: { type: "checkbox" },
          properties: { value: "hello", checked: true, selectedIndex: null },
          shadowRoot: false,
        },
      },
      "input1",
    );
    const accessor = makeAccessorWithSnapshot(() => makeSnapshot(vtree));
    const result = executeTool(accessor, "getElementDetails", {
      nodeId: "input1",
      timestampMs: 0,
    }) as Record<string, unknown>;

    const element = result["element"] as Record<string, unknown>;
    assert.ok("properties" in element);
    const props = element["properties"] as Record<string, unknown>;
    assert.strictEqual(props["value"], "hello");
    assert.strictEqual(props["checked"], true);
    assert.ok(!("selectedIndex" in props));
  });

  it("null attributes are omitted from element.attributes", () => {
    const vtree = makeVTree(
      {
        div1: {
          type: NodeType.Element,
          id: "div1",
          parentId: null,
          tagName: "div",
          children: [],
          attributes: { class: "foo", style: null },
          properties: { value: null, checked: null, selectedIndex: null },
          shadowRoot: false,
        },
      },
      "div1",
    );
    const accessor = makeAccessorWithSnapshot(() => makeSnapshot(vtree));
    const result = executeTool(accessor, "getElementDetails", {
      nodeId: "div1",
      timestampMs: 0,
    }) as Record<string, unknown>;

    const element = result["element"] as Record<string, unknown>;
    const attrs = element["attributes"] as Record<string, unknown>;
    assert.ok("class" in attrs);
    assert.ok(!("style" in attrs));
  });
});

describe("executeTool — getElementDetails — textContent", () => {
  it("truncates to 200 chars", () => {
    const longText = "x".repeat(300);
    const vtree = makeVTree(
      {
        div1: {
          type: NodeType.Element,
          id: "div1",
          parentId: null,
          tagName: "div",
          children: ["txt1"],
          attributes: {},
          properties: { value: null, checked: null, selectedIndex: null },
          shadowRoot: false,
        },
        txt1: {
          type: NodeType.Text,
          id: "txt1",
          parentId: "div1",
          value: longText,
        },
      },
      "div1",
    );
    const accessor = makeAccessorWithSnapshot(() => makeSnapshot(vtree));
    const result = executeTool(accessor, "getElementDetails", {
      nodeId: "div1",
      timestampMs: 0,
    }) as Record<string, unknown>;

    assert.ok(typeof result["textContent"] === "string");
    assert.ok((result["textContent"] as string).length <= 200);
  });

  it("empty text content is omitted", () => {
    const vtree = makeVTree(
      {
        div1: {
          type: NodeType.Element,
          id: "div1",
          parentId: null,
          tagName: "div",
          children: [],
          attributes: {},
          properties: { value: null, checked: null, selectedIndex: null },
          shadowRoot: false,
        },
      },
      "div1",
    );
    const accessor = makeAccessorWithSnapshot(() => makeSnapshot(vtree));
    const result = executeTool(accessor, "getElementDetails", {
      nodeId: "div1",
      timestampMs: 0,
    }) as Record<string, unknown>;

    assert.strictEqual(result["textContent"], undefined);
  });
});
