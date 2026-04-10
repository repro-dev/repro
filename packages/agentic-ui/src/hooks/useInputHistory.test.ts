import expect from "expect";
import { describe, it } from "node:test";
import { extractUserMessages, createHistoryCursor } from "./useInputHistory";

// Tests for pure logic extracted from useInputHistory:
// - extractUserMessages: extracts user message content from Entry array
// - createHistoryCursor: manages cursor position in the history array

describe("extractUserMessages", () => {
  it("returns an empty array when entries is empty", () => {
    expect(extractUserMessages([])).toEqual([]);
  });

  it("returns only user message content in chronological order", () => {
    const entries = [
      {
        id: "1",
        role: "user" as const,
        content: "first",
        timestamp: new Date(),
      },
      {
        id: "2",
        role: "assistant" as const,
        content: "",
        toolCalls: [],
        timestamp: new Date(),
      },
      {
        id: "3",
        role: "user" as const,
        content: "second",
        timestamp: new Date(),
      },
    ];
    expect(extractUserMessages(entries)).toEqual(["first", "second"]);
  });

  it("ignores assistant, system, and tool messages", () => {
    const entries = [
      {
        id: "1",
        role: "assistant" as const,
        content: "",
        toolCalls: [],
        timestamp: new Date(),
      },
    ];
    expect(extractUserMessages(entries)).toEqual([]);
  });
});

describe("createHistoryCursor", () => {
  const history = ["first", "second", "third"];

  it("navigateUp from neutral returns the last (most recent) message", () => {
    const cursor = createHistoryCursor(history);
    expect(cursor.navigateUp()).toBe("third");
  });

  it("navigateUp repeatedly cycles backward through history", () => {
    const cursor = createHistoryCursor(history);
    cursor.navigateUp(); // 'third'
    expect(cursor.navigateUp()).toBe("second");
    expect(cursor.navigateUp()).toBe("first");
  });

  it("navigateUp stops at the oldest message (does not wrap)", () => {
    const cursor = createHistoryCursor(history);
    cursor.navigateUp(); // 'third'
    cursor.navigateUp(); // 'second'
    cursor.navigateUp(); // 'first'
    expect(cursor.navigateUp()).toBe("first");
  });

  it("navigateDown after navigateUp moves forward through history", () => {
    const cursor = createHistoryCursor(history);
    cursor.navigateUp(); // 'third'
    cursor.navigateUp(); // 'second'
    expect(cursor.navigateDown()).toBe("third");
  });

  it("navigateDown past the most recent returns null (restore pre-history state)", () => {
    const cursor = createHistoryCursor(history);
    cursor.navigateUp(); // 'third'
    expect(cursor.navigateDown()).toBeNull();
  });

  it("can be constructed with an initial draft; navigateDown past newest returns the draft", () => {
    const cursor = createHistoryCursor(history, "my draft");
    cursor.navigateUp(); // enters history: 'third'
    expect(cursor.navigateDown()).toBe("my draft");
  });

  it("saveDraft stores a draft value that is returned when exiting history mode", () => {
    const cursor = createHistoryCursor(history);
    cursor.saveDraft("typed text");
    cursor.navigateUp(); // enters history: 'third'
    expect(cursor.navigateDown()).toBe("typed text");
  });

  it("navigateDown in neutral returns null", () => {
    const cursor = createHistoryCursor(history);
    expect(cursor.navigateDown()).toBeNull();
  });

  it("returns null for navigateUp when history is empty", () => {
    const cursor = createHistoryCursor([]);
    expect(cursor.navigateUp()).toBeNull();
  });

  it("reset returns cursor to neutral position", () => {
    const cursor = createHistoryCursor(history);
    cursor.navigateUp(); // 'third'
    cursor.reset();
    // After reset, navigateDown should return null (cursor is at neutral)
    expect(cursor.navigateDown()).toBeNull();
    // After reset, navigateUp should again return the last message
    expect(cursor.navigateUp()).toBe("third");
  });
});
