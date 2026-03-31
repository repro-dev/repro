import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { applyPromptSuggestionsFromData } from "./applyPromptSuggestions";
import type { PromptSuggestion } from "./promptCritic";

// Hardcoded map mirrors the one in applyPromptSuggestions.ts so tests know
// which targets are valid.
const VALID_TARGET = "EXTENSION_SYSTEM_CARD_MESSAGE";
const VALID_FILE = "packages/agentic/src/model/system.ts";

describe("applyPromptSuggestionsFromData", () => {
  it("returns unchanged map when suggestions is empty", () => {
    const fileContents = new Map([[VALID_FILE, "hello world"]]);
    const result = applyPromptSuggestionsFromData([], fileContents);
    assert.equal(result.size, 0);
  });

  it("applies a simple text replacement", () => {
    const original = "foo bar baz";
    const fileContents = new Map([[VALID_FILE, original]]);
    const suggestions: Array<PromptSuggestion> = [
      {
        target: VALID_TARGET,
        currentText: "bar",
        suggestedText: "qux",
        rationale: "test",
      },
    ];
    const result = applyPromptSuggestionsFromData(suggestions, fileContents);
    assert.equal(result.get(VALID_FILE), "foo qux baz");
  });

  it("normalises \\` → ` in file content when searching", () => {
    // The source file uses escaped backtick (\`) inside a template literal;
    // the critic quotes the evaluated string (plain `). Normalisation allows
    // the replacement to still find the location.
    const original = "Use \\`getDOMState\\` tool";
    const fileContents = new Map([[VALID_FILE, original]]);
    const suggestions: Array<PromptSuggestion> = [
      {
        target: VALID_TARGET,
        currentText: "Use `getDOMState` tool",
        suggestedText: "Use `getDOMState` or `getElementDetails` tool",
        rationale: "test",
      },
    ];
    const result = applyPromptSuggestionsFromData(suggestions, fileContents);
    // The replacement is written as-is (not re-escaped); the matched region in
    // the original (with escaped backticks) is replaced by suggestedText.
    assert.equal(
      result.get(VALID_FILE),
      "Use `getDOMState` or `getElementDetails` tool",
    );
  });

  it("skips and warns when target not in EXPORT_TO_FILE map", () => {
    const messages: Array<string> = [];
    const origWarn = console.warn;
    console.warn = (...args: Array<unknown>) => {
      messages.push(args.join(" "));
    };
    try {
      const fileContents = new Map([[VALID_FILE, "some content"]]);
      const suggestions: Array<PromptSuggestion> = [
        {
          target: "UNKNOWN_EXPORT",
          currentText: "some",
          suggestedText: "other",
          rationale: "test",
        },
      ];
      const result = applyPromptSuggestionsFromData(suggestions, fileContents);
      assert.equal(result.size, 0);
      assert.ok(
        messages.some((m) => m.includes("UNKNOWN_EXPORT")),
        "should warn about unknown target",
      );
    } finally {
      console.warn = origWarn;
    }
  });

  it("skips and warns when currentText not found even after normalisation", () => {
    const messages: Array<string> = [];
    const origWarn = console.warn;
    console.warn = (...args: Array<unknown>) => {
      messages.push(args.join(" "));
    };
    try {
      const fileContents = new Map([[VALID_FILE, "hello world"]]);
      const suggestions: Array<PromptSuggestion> = [
        {
          target: VALID_TARGET,
          currentText: "not present anywhere",
          suggestedText: "replacement",
          rationale: "test",
        },
      ];
      const result = applyPromptSuggestionsFromData(suggestions, fileContents);
      assert.equal(result.size, 0);
      assert.ok(
        messages.some((m) => m.includes("not found")),
        "should warn about missing currentText",
      );
    } finally {
      console.warn = origWarn;
    }
  });

  it("only replaces first occurrence when currentText appears multiple times", () => {
    const original = "aaa bbb aaa bbb aaa";
    const fileContents = new Map([[VALID_FILE, original]]);
    const suggestions: Array<PromptSuggestion> = [
      {
        target: VALID_TARGET,
        currentText: "aaa",
        suggestedText: "ccc",
        rationale: "test",
      },
    ];
    const result = applyPromptSuggestionsFromData(suggestions, fileContents);
    assert.equal(result.get(VALID_FILE), "ccc bbb aaa bbb aaa");
  });
});
