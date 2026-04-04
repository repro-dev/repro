import assert from "node:assert";
import { describe, it } from "node:test";
import { isNodeEnvironment } from "./token-optimization";

describe("isNodeEnvironment", () => {
  it("returns true in the current Node.js test environment", () => {
    // Tests run in Node — process.versions.node is set and window is undefined
    assert.strictEqual(isNodeEnvironment(), true);
  });

  it("returns false when window is defined (simulated browser)", () => {
    // Temporarily simulate a browser global
    const g = globalThis as Record<string, unknown>;
    g["window"] = {};
    try {
      assert.strictEqual(isNodeEnvironment(), false);
    } finally {
      // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
      delete g["window"];
    }
  });

  it("returns false when process is undefined (simulated non-Node)", () => {
    // Temporarily shadow process
    const originalProcess = globalThis.process;
    (globalThis as Record<string, unknown>)["process"] = undefined;
    try {
      assert.strictEqual(isNodeEnvironment(), false);
    } finally {
      globalThis.process = originalProcess;
    }
  });
});
