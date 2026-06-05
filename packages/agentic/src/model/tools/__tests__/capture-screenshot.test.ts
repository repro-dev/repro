import assert from "node:assert/strict";
import { describe, it, mock } from "node:test";

// Mock browser-only packages before any imports that transitively load them.
// @repro/dom-to-image references DOM globals (Node.ELEMENT_NODE) at module
// initialization time and cannot load in a Node.js test environment.
mock.module("@repro/dom-to-image", {
  namedExports: {
    captureDocument: async () => "data:image/png;base64,mock",
    createOffscreenDocument: async () => ({
      doc: {},
      cleanup: () => undefined,
    }),
  },
});

mock.module("@repro/vdom-renderer", {
  namedExports: {
    clearDocument: () => undefined,
    createDOMFromVTree: () => [null, {}],
    patchDocumentElement: () => undefined,
  },
});

// Use require() so the mock registration above takes effect before the module loads.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { tools, extensionTools } =
  require("../index") as typeof import("../index");

describe("tools array — captureScreenshot", () => {
  it("includes captureScreenshot in the registered tools array", () => {
    const def = tools.find(
      (t) =>
        (t as { function: { name: string } }).function.name ===
        "captureScreenshot",
    );
    assert.ok(def !== undefined, "captureScreenshot should be in tools[]");
  });

  it("captureScreenshot tool definition has correct type and function shape", () => {
    const def = tools.find(
      (t) =>
        (t as { function: { name: string } }).function.name ===
        "captureScreenshot",
    ) as {
      type: string;
      function: {
        name: string;
        description: string;
        parameters: {
          type: string;
          properties: Record<string, unknown>;
          required: string[];
        };
      };
    };
    assert.ok(def !== undefined);
    assert.strictEqual(def.type, "function");
    assert.strictEqual(def.function.name, "captureScreenshot");
    assert.ok(typeof def.function.description === "string");
    assert.ok(def.function.description.length > 0);
  });

  it("captureScreenshot tool definition requires timestampMs parameter", () => {
    const def = tools.find(
      (t) =>
        (t as { function: { name: string } }).function.name ===
        "captureScreenshot",
    ) as {
      function: {
        parameters: {
          required: string[];
          properties: Record<string, unknown>;
        };
      };
    };
    assert.ok(def !== undefined);
    assert.ok(def.function.parameters.required.includes("timestampMs"));
    assert.ok(def.function.parameters.properties["timestampMs"] !== undefined);
  });
});

describe("extensionTools array", () => {
  it("excludes captureScreenshot from extensionTools", () => {
    const def = extensionTools.find(
      (t) =>
        (t as { function: { name: string } }).function.name ===
        "captureScreenshot",
    );
    assert.strictEqual(
      def,
      undefined,
      "captureScreenshot should NOT be in extensionTools[]",
    );
  });

  it("extensionTools contains all tools from tools[] except captureScreenshot and askUser", () => {
    const toolNames = tools
      .map((t) => (t as { function: { name: string } }).function.name)
      .filter((name) => name !== "captureScreenshot" && name !== "askUser");
    const extensionToolNames = extensionTools.map(
      (t) => (t as { function: { name: string } }).function.name,
    );
    assert.deepStrictEqual(extensionToolNames, toolNames);
  });

  it("extensionTools is smaller than tools by exactly two entries (captureScreenshot + askUser)", () => {
    assert.strictEqual(extensionTools.length, tools.length - 2);
  });
});
