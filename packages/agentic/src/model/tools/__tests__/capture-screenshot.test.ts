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
const { tools } = require("../index") as typeof import("../index");

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
