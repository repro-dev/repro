import { NodeType, Snapshot, SourceEvent } from "@repro/domain";
import assert from "node:assert";
import { describe, it } from "node:test";
import { RecordingDataAccessor } from "../types";
import { executeTool, tools } from "./tools";

function makeVTree(nodes: Record<string, any>, rootId: string) {
  const boxedNodes: Record<string, any> = {};
  for (const [id, node] of Object.entries(nodes)) {
    boxedNodes[id] = {
      match: (fn: (n: any) => boolean) => fn(node),
      apply: (fn: (n: any) => void) => fn(node),
      get: (key: string) => ({
        orElse: (fallback: any) => (node as any)[key] ?? fallback,
        map: (fn: (v: any) => any) => ({
          orElse: (fb: any) => {
            const val = (node as any)[key];
            return val != null ? fn(val) : fb;
          },
        }),
      }),
    };
  }
  return { rootId, nodes: boxedNodes };
}

function makeSnapshot(vtree: any): Snapshot {
  return { dom: vtree, interaction: null } as unknown as Snapshot;
}

function makeAccessor(
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

describe("executeTool — getElementDetails", () => {
  it("tool definition exists in tools array", () => {
    const found = tools.find(
      (t) => "function" in t && t.function.name === "getElementDetails",
    );
    assert.ok(found !== undefined);
  });

  it("missing nodeId returns error", () => {
    const accessor = makeEmptyAccessor();
    const result = executeTool(accessor, "getElementDetails", {}) as any;
    assert.ok("error" in result);
    assert.ok((result.error as string).toLowerCase().includes("nodeid"));
  });

  it("missing nodeId returns reason and suggestion mentioning getDOMState", () => {
    const accessor = makeEmptyAccessor();
    const result = executeTool(accessor, "getElementDetails", {}) as any;
    assert.ok(result.reason);
    assert.ok(result.suggestion);
    assert.ok((result.suggestion as string).includes("getDOMState"));
  });

  it("missing timestampMs returns error", () => {
    const accessor = makeEmptyAccessor();
    const result = executeTool(accessor, "getElementDetails", {
      nodeId: "x",
    }) as any;
    assert.ok("error" in result);
    assert.ok((result.error as string).toLowerCase().includes("timestampms"));
  });

  it("missing timestampMs returns reason and suggestion mentioning getRecordingDuration", () => {
    const accessor = makeEmptyAccessor();
    const result = executeTool(accessor, "getElementDetails", {
      nodeId: "x",
    }) as any;
    assert.ok(result.reason);
    assert.ok(result.suggestion);
    assert.ok((result.suggestion as string).includes("getRecordingDuration"));
  });

  it("no snapshot returns error", () => {
    const accessor = makeEmptyAccessor();
    const result = executeTool(accessor, "getElementDetails", {
      nodeId: "abc",
      timestampMs: 1000,
    }) as any;
    assert.ok("error" in result);
    assert.ok((result.error as string).toLowerCase().includes("snapshot"));
  });

  it("no snapshot returns reason and suggestion mentioning getRecordingDuration", () => {
    const accessor = makeEmptyAccessor();
    const result = executeTool(accessor, "getElementDetails", {
      nodeId: "abc",
      timestampMs: 1000,
    }) as any;
    assert.ok(result.reason);
    assert.ok(result.suggestion);
    assert.ok((result.suggestion as string).includes("getRecordingDuration"));
  });

  it("node not found returns error containing the nodeId", () => {
    const vtree = makeStandardVTree();
    const accessor = makeAccessor(() => makeSnapshot(vtree));
    const result = executeTool(accessor, "getElementDetails", {
      nodeId: "zzz99",
      timestampMs: 1000,
    }) as any;
    assert.ok("error" in result);
    assert.ok((result.error as string).includes("zzz99"));
  });

  it("node not found returns reason and suggestion mentioning getDOMState", () => {
    const vtree = makeStandardVTree();
    const accessor = makeAccessor(() => makeSnapshot(vtree));
    const result = executeTool(accessor, "getElementDetails", {
      nodeId: "zzz99",
      timestampMs: 1000,
    }) as any;
    assert.ok(result.reason);
    assert.ok(result.suggestion);
    assert.ok((result.suggestion as string).includes("getDOMState"));
  });

  it("self context returns element, parents, siblings, textContent; no children", () => {
    const vtree = makeStandardVTree();
    const accessor = makeAccessor(() => makeSnapshot(vtree));
    const result = executeTool(accessor, "getElementDetails", {
      nodeId: "btn1",
      timestampMs: 1000,
    }) as any;

    assert.strictEqual(result.element.nodeId, "btn1");
    assert.strictEqual(result.element.tagName, "button");
    assert.ok("class" in result.element.attributes);
    assert.ok("data-testid" in result.element.attributes);
    assert.ok("disabled" in result.element.attributes);

    assert.strictEqual(result.parents.length, 3);
    assert.strictEqual(result.parents[0].nodeId, "div1");
    assert.strictEqual(result.parents[1].nodeId, "body");
    assert.strictEqual(result.parents[2].nodeId, "html");

    assert.strictEqual(result.siblings.length, 1);
    assert.strictEqual(result.siblings[0].nodeId, "span1");
    assert.ok("class" in result.siblings[0].attributes);

    assert.strictEqual(result.textContent, "Click me");
    assert.strictEqual(result.children, undefined);
  });

  it("subtree context includes direct children", () => {
    const vtree = makeStandardVTree();
    const accessor = makeAccessor(() => makeSnapshot(vtree));
    const result = executeTool(accessor, "getElementDetails", {
      nodeId: "div1",
      timestampMs: 1000,
      context: "subtree",
    }) as any;

    assert.ok(Array.isArray(result.children));
    assert.strictEqual(result.children.length, 2);
    const childIds = result.children.map((c: any) => c.nodeId);
    assert.ok(childIds.includes("btn1"));
    assert.ok(childIds.includes("span1"));
  });

  it("ancestry context returns full parent chain", () => {
    const vtree = makeStandardVTree();
    const accessor = makeAccessor(() => makeSnapshot(vtree));
    const result = executeTool(accessor, "getElementDetails", {
      nodeId: "btn1",
      timestampMs: 1000,
      context: "ancestry",
    }) as any;

    const parentIds = result.parents.map((p: any) => p.nodeId);
    assert.ok(parentIds.includes("div1"));
    assert.ok(parentIds.includes("body"));
    assert.ok(parentIds.includes("html"));
  });

  it("properties included when non-null, null ones omitted", () => {
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
    const accessor = makeAccessor(() => makeSnapshot(vtree));
    const result = executeTool(accessor, "getElementDetails", {
      nodeId: "input1",
      timestampMs: 0,
    }) as any;

    assert.ok("properties" in result.element);
    assert.strictEqual(result.element.properties.value, "hello");
    assert.strictEqual(result.element.properties.checked, true);
    assert.ok(!("selectedIndex" in result.element.properties));
  });

  it("text content truncated to 200 chars", () => {
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
    const accessor = makeAccessor(() => makeSnapshot(vtree));
    const result = executeTool(accessor, "getElementDetails", {
      nodeId: "div1",
      timestampMs: 0,
    }) as any;

    assert.ok(typeof result.textContent === "string");
    assert.ok(result.textContent.length <= 200);
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
    const accessor = makeAccessor(() => makeSnapshot(vtree));
    const result = executeTool(accessor, "getElementDetails", {
      nodeId: "div1",
      timestampMs: 0,
    }) as any;

    assert.ok("class" in result.element.attributes);
    assert.ok(!("style" in result.element.attributes));
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
    const accessor = makeAccessor(() => makeSnapshot(vtree));
    const result = executeTool(accessor, "getElementDetails", {
      nodeId: "div1",
      timestampMs: 0,
    }) as any;

    assert.strictEqual(result.textContent, undefined);
  });
});
