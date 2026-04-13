import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  EXPORT_TO_FILE,
  applyPromptSuggestionsFromData,
} from "./applyPromptSuggestions";
import type { PromptSuggestion } from "./promptCritic";

// Derive from the canonical map so tests never drift from the source of truth.
const [VALID_TARGET, VALID_FILE] = Object.entries(EXPORT_TO_FILE)[0]!;

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

  it("matches escaped-backtick form when verbatim match fails", () => {
    // The source file uses \` inside template literals; the critic quotes the
    // evaluated string with plain `. The escaped-backtick fallback finds the
    // location in the original content and replaces with the escaped form of
    // suggestedText, preserving the file's existing escape style.
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
    // Escaped backticks in the original are preserved; the replacement also
    // uses the escaped form of suggestedText.
    assert.equal(
      result.get(VALID_FILE),
      "Use \\`getDOMState\\` or \\`getElementDetails\\` tool",
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
