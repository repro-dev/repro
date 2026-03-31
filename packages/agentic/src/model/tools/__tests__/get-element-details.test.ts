import { NodeType, Snapshot, SourceEvent } from "@repro/domain";
import { fork } from "fluture";
import type { FutureInstance } from "fluture";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { RecordingDataAccessor } from "../../../types";
import { executeTool, tools } from "../index";

// Forks a FutureInstance into a Promise so tests can use await.
function runFuture<L, R>(future: FutureInstance<L, R>): Promise<R> {
  return new Promise<R>((resolve, reject) => {
    fork(reject)(resolve)(future);
  });
}

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
    getResourceMap: () => ({}),
  };
}

function makeEmptyAccessor(): RecordingDataAccessor {
  return {
    getDuration: () => 0,
    getSnapshotAtTime: () => null,
    getEventsByType: () => [] as Array<SourceEvent>,
    getEventsInRange: () => [] as Array<SourceEvent>,
    getResourceMap: () => ({}),
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
  it("tool definition exists in tools array", async () => {
    const found = tools.find(
      (t) => "function" in t && t.function.name === "getElementDetails",
    );
    assert.ok(found !== undefined);
  });
});

describe("executeTool — getElementDetails — errors", () => {
  it("missing nodeId returns error", async () => {
    const accessor = makeEmptyAccessor();
    const result = (await runFuture(
      executeTool(accessor, "getElementDetails", {}),
    )) as Record<string, unknown>;
    assert.ok("error" in result);
    assert.ok((result["error"] as string).toLowerCase().includes("nodeid"));
  });

  it("missing nodeId returns reason and suggestion mentioning getDOMState", async () => {
    const accessor = makeEmptyAccessor();
    const result = (await runFuture(
      executeTool(accessor, "getElementDetails", {}),
    )) as Record<string, unknown>;
    assert.ok(result["reason"]);
    assert.ok(result["suggestion"]);
    assert.ok((result["suggestion"] as string).includes("getDOMState"));
  });

  it("missing timestampMs returns error", async () => {
    const accessor = makeEmptyAccessor();
    const result = (await runFuture(
      executeTool(accessor, "getElementDetails", {
        nodeId: "x",
      }),
    )) as Record<string, unknown>;
    assert.ok("error" in result);
    assert.ok(
      (result["error"] as string).toLowerCase().includes("timestampms"),
    );
  });

  it("missing timestampMs returns reason and suggestion mentioning getRecordingDuration", async () => {
    const accessor = makeEmptyAccessor();
    const result = (await runFuture(
      executeTool(accessor, "getElementDetails", {
        nodeId: "x",
      }),
    )) as Record<string, unknown>;
    assert.ok(result["reason"]);
    assert.ok(result["suggestion"]);
    assert.ok(
      (result["suggestion"] as string).includes("getRecordingDuration"),
    );
  });

  it("no snapshot returns error", async () => {
    const accessor = makeEmptyAccessor();
    const result = (await runFuture(
      executeTool(accessor, "getElementDetails", {
        nodeId: "abc",
        timestampMs: 1000,
      }),
    )) as Record<string, unknown>;
    assert.ok("error" in result);
    assert.ok((result["error"] as string).toLowerCase().includes("snapshot"));
  });

  it("no snapshot returns reason and suggestion mentioning getRecordingDuration", async () => {
    const accessor = makeEmptyAccessor();
    const result = (await runFuture(
      executeTool(accessor, "getElementDetails", {
        nodeId: "abc",
        timestampMs: 1000,
      }),
    )) as Record<string, unknown>;
    assert.ok(result["reason"]);
    assert.ok(result["suggestion"]);
    assert.ok(
      (result["suggestion"] as string).includes("getRecordingDuration"),
    );
  });

  it("node not found returns error containing the nodeId", async () => {
    const vtree = makeStandardVTree();
    const accessor = makeAccessorWithSnapshot(() => makeSnapshot(vtree));
    const result = (await runFuture(
      executeTool(accessor, "getElementDetails", {
        nodeId: "zzz99",
        timestampMs: 1000,
      }),
    )) as Record<string, unknown>;
    assert.ok("error" in result);
    assert.ok((result["error"] as string).includes("zzz99"));
  });

  it("node not found returns reason and suggestion mentioning getDOMState", async () => {
    const vtree = makeStandardVTree();
    const accessor = makeAccessorWithSnapshot(() => makeSnapshot(vtree));
    const result = (await runFuture(
      executeTool(accessor, "getElementDetails", {
        nodeId: "zzz99",
        timestampMs: 1000,
      }),
    )) as Record<string, unknown>;
    assert.ok(result["reason"]);
    assert.ok(result["suggestion"]);
    assert.ok((result["suggestion"] as string).includes("getDOMState"));
  });
});

describe("executeTool — getElementDetails — self context", () => {
  it("returns element, parents, siblings, textContent; no children", async () => {
    const vtree = makeStandardVTree();
    const accessor = makeAccessorWithSnapshot(() => makeSnapshot(vtree));
    const result = (await runFuture(
      executeTool(accessor, "getElementDetails", {
        nodeId: "btn1",
        timestampMs: 1000,
      }),
    )) as Record<string, unknown>;

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
  it("includes direct children", async () => {
    const vtree = makeStandardVTree();
    const accessor = makeAccessorWithSnapshot(() => makeSnapshot(vtree));
    const result = (await runFuture(
      executeTool(accessor, "getElementDetails", {
        nodeId: "div1",
        timestampMs: 1000,
        context: "subtree",
      }),
    )) as Record<string, unknown>;

    const children = result["children"] as Array<Record<string, unknown>>;
    assert.ok(Array.isArray(children));
    assert.strictEqual(children.length, 2);
    const childIds = children.map((c) => c["nodeId"]);
    assert.ok(childIds.includes("btn1"));
    assert.ok(childIds.includes("span1"));
  });
});

describe("executeTool — getElementDetails — ancestry context", () => {
  it("returns full parent chain", async () => {
    const vtree = makeStandardVTree();
    const accessor = makeAccessorWithSnapshot(() => makeSnapshot(vtree));
    const result = (await runFuture(
      executeTool(accessor, "getElementDetails", {
        nodeId: "btn1",
        timestampMs: 1000,
        context: "ancestry",
      }),
    )) as Record<string, unknown>;

    const parents = result["parents"] as Array<Record<string, unknown>>;
    const parentIds = parents.map((p) => p["nodeId"]);
    assert.ok(parentIds.includes("div1"));
    assert.ok(parentIds.includes("body"));
    assert.ok(parentIds.includes("html"));
  });
});

describe("executeTool — getElementDetails — properties", () => {
  it("includes non-null properties and omits null ones", async () => {
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
    const result = (await runFuture(
      executeTool(accessor, "getElementDetails", {
        nodeId: "input1",
        timestampMs: 0,
      }),
    )) as Record<string, unknown>;

    const element = result["element"] as Record<string, unknown>;
    assert.ok("properties" in element);
    const props = element["properties"] as Record<string, unknown>;
    assert.strictEqual(props["value"], "hello");
    assert.strictEqual(props["checked"], true);
    assert.ok(!("selectedIndex" in props));
  });

  it("null attributes are omitted from element.attributes", async () => {
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
    const result = (await runFuture(
      executeTool(accessor, "getElementDetails", {
        nodeId: "div1",
        timestampMs: 0,
      }),
    )) as Record<string, unknown>;

    const element = result["element"] as Record<string, unknown>;
    const attrs = element["attributes"] as Record<string, unknown>;
    assert.ok("class" in attrs);
    assert.ok(!("style" in attrs));
  });
});

describe("executeTool — getElementDetails — textContent", () => {
  it("truncates to 200 chars", async () => {
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
    const result = (await runFuture(
      executeTool(accessor, "getElementDetails", {
        nodeId: "div1",
        timestampMs: 0,
      }),
    )) as Record<string, unknown>;

    assert.ok(typeof result["textContent"] === "string");
    assert.ok((result["textContent"] as string).length <= 200);
  });

  it("empty text content is omitted", async () => {
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
    const result = (await runFuture(
      executeTool(accessor, "getElementDetails", {
        nodeId: "div1",
        timestampMs: 0,
      }),
    )) as Record<string, unknown>;

    assert.strictEqual(result["textContent"], undefined);
  });
});

// 4-level deep VTree: div > section > article > span
function makeDeepVTree() {
  return makeVTree(
    {
      root: {
        type: NodeType.Document,
        id: "root",
        parentId: null,
        children: ["div1"],
      },
      div1: {
        type: NodeType.Element,
        id: "div1",
        parentId: "root",
        tagName: "div",
        children: ["section1"],
        attributes: { id: "root-div" },
        properties: { value: null, checked: null, selectedIndex: null },
        shadowRoot: false,
      },
      section1: {
        type: NodeType.Element,
        id: "section1",
        parentId: "div1",
        tagName: "section",
        children: ["article1"],
        attributes: {},
        properties: { value: null, checked: null, selectedIndex: null },
        shadowRoot: false,
      },
      article1: {
        type: NodeType.Element,
        id: "article1",
        parentId: "section1",
        tagName: "article",
        children: ["span1"],
        attributes: {},
        properties: { value: null, checked: null, selectedIndex: null },
        shadowRoot: false,
      },
      span1: {
        type: NodeType.Element,
        id: "span1",
        parentId: "article1",
        tagName: "span",
        children: ["txt1"],
        attributes: {},
        properties: { value: null, checked: null, selectedIndex: null },
        shadowRoot: false,
      },
      txt1: {
        type: NodeType.Text,
        id: "txt1",
        parentId: "span1",
        value: "deep text",
      },
    },
    "root",
  );
}

describe("executeTool — getElementDetails — subtree depth", () => {
  it("depth:1 → children has elements but none have children property", async () => {
    const vtree = makeDeepVTree();
    const accessor = makeAccessorWithSnapshot(() => makeSnapshot(vtree));
    const result = (await runFuture(
      executeTool(accessor, "getElementDetails", {
        nodeId: "div1",
        timestampMs: 1000,
        context: "subtree",
        depth: 1,
      }),
    )) as Record<string, unknown>;

    const children = result["children"] as Array<Record<string, unknown>>;
    assert.ok(Array.isArray(children));
    assert.ok(children.length > 0);
    for (const child of children) {
      assert.strictEqual(
        child["children"],
        undefined,
        "depth:1 children should not have children property",
      );
    }
  });

  it("depth:2 → children have their own children but grandchildren do not", async () => {
    const vtree = makeDeepVTree();
    const accessor = makeAccessorWithSnapshot(() => makeSnapshot(vtree));
    const result = (await runFuture(
      executeTool(accessor, "getElementDetails", {
        nodeId: "div1",
        timestampMs: 1000,
        context: "subtree",
        depth: 2,
      }),
    )) as Record<string, unknown>;

    const children = result["children"] as Array<Record<string, unknown>>;
    assert.ok(Array.isArray(children));
    assert.ok(children.length > 0);

    // Level 2 children (section) should have children
    const section = children.find((c) => c["nodeId"] === "section1");
    assert.ok(section, "section1 should be in children");
    const sectionChildren = section!["children"] as Array<
      Record<string, unknown>
    >;
    assert.ok(
      Array.isArray(sectionChildren),
      "section should have children array",
    );

    // Level 3 (article) should NOT have children
    for (const grandchild of sectionChildren) {
      assert.strictEqual(
        grandchild["children"],
        undefined,
        "depth:2 grandchildren should not have children",
      );
    }
  });

  it("depth:3 (default when not passed) → 3 levels deep", async () => {
    const vtree = makeDeepVTree();
    const accessor = makeAccessorWithSnapshot(() => makeSnapshot(vtree));
    const result = (await runFuture(
      executeTool(accessor, "getElementDetails", {
        nodeId: "div1",
        timestampMs: 1000,
        context: "subtree",
        // no depth provided — default is 3
      }),
    )) as Record<string, unknown>;

    const children = result["children"] as Array<Record<string, unknown>>;
    assert.ok(Array.isArray(children));

    // Level 2: section should have children
    const section = children.find((c) => c["nodeId"] === "section1") as Record<
      string,
      unknown
    >;
    assert.ok(section);
    const sectionChildren = section["children"] as Array<
      Record<string, unknown>
    >;
    assert.ok(Array.isArray(sectionChildren));

    // Level 3: article should have children
    const article = sectionChildren.find(
      (c) => c["nodeId"] === "article1",
    ) as Record<string, unknown>;
    assert.ok(article);
    const articleChildren = article["children"] as Array<
      Record<string, unknown>
    >;
    assert.ok(Array.isArray(articleChildren));

    // Level 4: span should NOT have children (exceeds depth 3)
    const span = articleChildren.find((c) => c["nodeId"] === "span1") as Record<
      string,
      unknown
    >;
    assert.ok(span);
    assert.strictEqual(
      span["children"],
      undefined,
      "depth:3 level-4 nodes should not have children",
    );
  });

  it("explicit depth:3 → same as default", async () => {
    const vtree = makeDeepVTree();
    const accessor = makeAccessorWithSnapshot(() => makeSnapshot(vtree));
    const resultDefault = (await runFuture(
      executeTool(accessor, "getElementDetails", {
        nodeId: "div1",
        timestampMs: 1000,
        context: "subtree",
      }),
    )) as Record<string, unknown>;
    const resultExplicit = (await runFuture(
      executeTool(accessor, "getElementDetails", {
        nodeId: "div1",
        timestampMs: 1000,
        context: "subtree",
        depth: 3,
      }),
    )) as Record<string, unknown>;

    // Both should have the same structure (excluding _tokenEstimate)
    const defaultChildren = JSON.stringify(resultDefault["children"]);
    const explicitChildren = JSON.stringify(resultExplicit["children"]);
    assert.strictEqual(defaultChildren, explicitChildren);
  });

  it("depth:0 → children is empty array or not present", async () => {
    const vtree = makeDeepVTree();
    const accessor = makeAccessorWithSnapshot(() => makeSnapshot(vtree));
    const result = (await runFuture(
      executeTool(accessor, "getElementDetails", {
        nodeId: "div1",
        timestampMs: 1000,
        context: "subtree",
        depth: 0,
      }),
    )) as Record<string, unknown>;

    const children = result["children"];
    // Either empty array or not present
    assert.ok(
      children === undefined ||
        (Array.isArray(children) && (children as unknown[]).length === 0),
      "depth:0 should yield no children",
    );
  });
});

describe("executeTool — getElementDetails — _tokenEstimate on subtree context", () => {
  it("response for context:subtree includes _tokenEstimate field (number > 0)", async () => {
    const vtree = makeStandardVTree();
    const accessor = makeAccessorWithSnapshot(() => makeSnapshot(vtree));
    const result = (await runFuture(
      executeTool(accessor, "getElementDetails", {
        nodeId: "div1",
        timestampMs: 1000,
        context: "subtree",
      }),
    )) as Record<string, unknown>;

    assert.ok(
      "_tokenEstimate" in result,
      "subtree response should include _tokenEstimate",
    );
    assert.ok(
      typeof result["_tokenEstimate"] === "number",
      "_tokenEstimate should be a number",
    );
    assert.ok(
      (result["_tokenEstimate"] as number) > 0,
      "_tokenEstimate should be > 0",
    );
  });
});
