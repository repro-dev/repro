import assert from "node:assert";
import { describe, it, mock } from "node:test";

// Mock @anthropic-ai/tokenizer BEFORE requiring token-optimization so the
// cached tokenizerModule is populated with our throwing stub rather than the
// real tokenizer. This exercises the try/catch fallback in estimateTokens.
mock.module("@anthropic-ai/tokenizer", {
  namedExports: {
    countTokens: () => {
      throw new Error("tokenizer unavailable");
    },
  },
});

// Use require() so the mock registration above takes effect before the module
// loads its cached tokenizer reference.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { estimateTokens } =
  require("./token-optimization") as typeof import("./token-optimization");

describe("estimateTokens — heuristic fallback", () => {
  it("returns Math.ceil(length/4) when the tokenizer throws", () => {
    // The mocked countTokens throws, so estimateTokens falls back to the
    // character-count heuristic: Math.ceil(JSON.stringify(input).length / 4)
    const input = "hello";
    const result = estimateTokens(input);
    const serialized = JSON.stringify(input); // '"hello"' — 7 chars
    const expected = Math.ceil(serialized.length / 4); // Math.ceil(1.75) = 2
    assert.strictEqual(result, expected);
  });

  it("uses Math.ceil (not Math.round) to avoid undercounting", () => {
    // Verify the heuristic rounds UP — undercounting risks overflowing context windows.
    // Use an input whose length is not divisible by 4 so floor ≠ ceil.
    // JSON.stringify('hi') = '"hi"' = 4 chars → Math.ceil(4/4) = 1, Math.round = 1
    // JSON.stringify('hey') = '"hey"' = 5 chars → Math.ceil(5/4) = 2, Math.round = 1
    const input = "hey";
    const result = estimateTokens(input);
    const serialized = JSON.stringify(input); // '"hey"' — 5 chars
    // Math.ceil(5/4) = 2; Math.round(5/4) = 1 — the two diverge here
    assert.strictEqual(result, Math.ceil(serialized.length / 4));
    assert.strictEqual(result, 2);
  });
});
