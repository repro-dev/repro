import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  computeContextBudget,
  truncateToContextBudget,
} from "./context-window";

// Typed message helper for isProtected tests
interface LabeledMessage {
  text: string;
  protected: boolean;
}

const lm = (text: string, protected_: boolean): LabeledMessage => ({
  text,
  protected: protected_,
});

describe("computeContextBudget", () => {
  it("computes budget for gpt-5-mini with known context window", () => {
    const systemTokens = 1_000;
    const budget = computeContextBudget("openai/gpt-5-mini", systemTokens);
    const expected = Math.floor(400_000 * 0.9) - systemTokens - 4_000;
    assert.equal(budget, expected);
  });

  it("computes budget for o3 with smaller context window", () => {
    const systemTokens = 500;
    const budget = computeContextBudget("openai/o3", systemTokens);
    const expected = Math.floor(200_000 * 0.9) - systemTokens - 4_000;
    assert.equal(budget, expected);
  });

  it("uses fallback context window for unknown model", () => {
    const systemTokens = 100;
    const budget = computeContextBudget("unknown/model", systemTokens);
    const expected = Math.floor(32_000 * 0.9) - systemTokens - 4_000;
    assert.equal(budget, expected);
  });

  it("subtracts both system tokens and current turn reserve", () => {
    const systemTokens = 2_000;
    const budget = computeContextBudget("openai/gpt-5-mini", systemTokens);
    assert.ok(budget < Math.floor(400_000 * 0.9) - systemTokens);
    assert.ok(budget < Math.floor(400_000 * 0.9) - 4_000);
  });
});

describe("truncateToContextBudget", () => {
  const messages = [
    "message one",
    "message two",
    "message three",
    "message four",
    "message five",
  ];

  const estimateMessage = (msg: string) => msg.length;

  it("returns all messages when total tokens fit within budget", () => {
    const budget = 1_000;
    const { messages: result } = truncateToContextBudget(
      messages,
      budget,
      estimateMessage,
    );
    assert.deepEqual(result, messages);
  });

  it("drops oldest messages when budget is exceeded", () => {
    const totalLength = messages.reduce((sum, m) => sum + m.length, 0);
    const budget = totalLength - messages[0]!.length - 1;
    const { messages: result } = truncateToContextBudget(
      messages,
      budget,
      estimateMessage,
    );
    assert.ok(!result.includes(messages[0]!));
    assert.ok(result.includes(messages[messages.length - 1]!));
  });

  it("keeps only the newest message when budget is very small", () => {
    const lastMsg = messages[messages.length - 1]!;
    const budget = lastMsg.length;
    const { messages: result } = truncateToContextBudget(
      messages,
      budget,
      estimateMessage,
    );
    assert.deepEqual(result, [lastMsg]);
  });

  it("returns empty array when budget is 0 and all messages have tokens", () => {
    const { messages: result } = truncateToContextBudget(
      messages,
      0,
      estimateMessage,
    );
    assert.deepEqual(result, []);
  });

  it("preserves order of remaining messages (newest at end)", () => {
    const budget = messages[3]!.length + messages[4]!.length;
    const { messages: result } = truncateToContextBudget(
      messages,
      budget,
      estimateMessage,
    );
    assert.deepEqual(result, [messages[3], messages[4]]);
  });

  it("handles empty messages array", () => {
    const { messages: result } = truncateToContextBudget(
      [],
      1_000,
      estimateMessage,
    );
    assert.deepEqual(result, []);
  });

  it("droppedCount is 0 when all messages fit within budget", () => {
    const budget = 1_000;
    const { droppedCount } = truncateToContextBudget(
      messages,
      budget,
      estimateMessage,
    );
    assert.equal(droppedCount, 0);
  });

  it("droppedCount matches the number of dropped messages", () => {
    // Drop first 2 messages: budget fits only the last 3
    const budget =
      messages[2]!.length + messages[3]!.length + messages[4]!.length;
    const { messages: result, droppedCount } = truncateToContextBudget(
      messages,
      budget,
      estimateMessage,
    );
    assert.equal(droppedCount, 2);
    assert.deepEqual(result, [messages[2], messages[3], messages[4]]);
  });

  it("droppedCount equals messages.length when budget is 0", () => {
    const { droppedCount } = truncateToContextBudget(
      messages,
      0,
      estimateMessage,
    );
    assert.equal(droppedCount, messages.length);
  });

  it("droppedCount is 0 for empty array", () => {
    const { droppedCount } = truncateToContextBudget(
      [],
      1_000,
      estimateMessage,
    );
    assert.equal(droppedCount, 0);
  });
});

describe("truncateToContextBudget with isProtected", () => {
  // Each LabeledMessage has a text (used for token estimation) and a protected flag.
  const estimateLm = (msg: LabeledMessage) => msg.text.length;
  const isProtectedFn = (msg: LabeledMessage) => msg.protected;

  it("protected messages are never dropped when non-protected messages can fill the budget", () => {
    // Budget fits exactly 3 messages worth of tokens, but there are 5 messages.
    // messages[0] and messages[1] are protected (small, 5 tokens each).
    // Non-protected: messages[2] (10), messages[3] (10), messages[4] (10) = 30
    // Budget = 25: fits all protected (10 total) + 1 non-protected tail (10) = 20
    // But only 25 total so protected (10) + 2 non-protected (20) = 30 > 25
    // protected (10) + 1 non-protected newest (10) = 20 <= 25  → keep msg[4]
    const msgs = [
      lm("ppppp", true), // idx 0, 5 tokens, protected
      lm("ppppp", true), // idx 1, 5 tokens, protected
      lm("aaaaaaaaaa", false), // idx 2, 10 tokens, drop
      lm("bbbbbbbbbb", false), // idx 3, 10 tokens, drop
      lm("cccccccccc", false), // idx 4, 10 tokens, keep (newest)
    ];
    const budget = 25; // fits both protected (10) + 1 non-protected (10) = 20
    const { messages: result } = truncateToContextBudget(
      msgs,
      budget,
      estimateLm,
      isProtectedFn,
    );

    // Protected messages must be retained
    assert.ok(
      result.includes(msgs[0]!),
      "first protected message must be retained",
    );
    assert.ok(
      result.includes(msgs[1]!),
      "second protected message must be retained",
    );
    // Oldest non-protected messages are dropped
    assert.ok(
      !result.includes(msgs[2]!),
      "oldest non-protected must be dropped",
    );
    assert.ok(
      !result.includes(msgs[3]!),
      "second non-protected must be dropped",
    );
    // Newest non-protected is kept
    assert.ok(
      result.includes(msgs[4]!),
      "newest non-protected must be retained",
    );
  });

  it("falls back to tail-truncation when protected messages alone exceed budget", () => {
    // Only protected messages, total = 30, budget = 20 → fallback: drop oldest
    const msgs = [
      lm("aaaaaaaaaa", true), // idx 0, 10 tokens, protected
      lm("bbbbbbbbbb", true), // idx 1, 10 tokens, protected
      lm("cccccccccc", true), // idx 2, 10 tokens, protected
    ];
    const budget = 20; // protected alone = 30 > 20 → fallback
    const { messages: result } = truncateToContextBudget(
      msgs,
      budget,
      estimateLm,
      isProtectedFn,
    );

    // Fallback behavior: keep newest 2
    assert.deepEqual(result, [msgs[1], msgs[2]]);
  });

  it("droppedCount reflects index of first retained message in original array", () => {
    // 5 messages: [0]=protected, [1]=non-protected, [2]=non-protected, [3]=non-protected, [4]=non-protected
    // Budget fits protected (5) + 2 non-protected newest (10+10=20) = 25 total
    // Drop: msgs[1] (10), msgs[2] (10) — keep msgs[0] (protected), msgs[3], msgs[4]
    // First retained in original order is msgs[0] at index 0 → droppedCount = 0
    const msgs = [
      lm("ppppp", true), // idx 0, 5 tokens, protected
      lm("aaaaaaaaaa", false), // idx 1, 10 tokens, dropped
      lm("bbbbbbbbbb", false), // idx 2, 10 tokens, dropped
      lm("cccccccccc", false), // idx 3, 10 tokens, kept
      lm("dddddddddd", false), // idx 4, 10 tokens, kept
    ];
    // Budget: 5 + 10 + 10 = 25; protected at idx 0 is earliest retained
    const budget = 25;
    const { droppedCount } = truncateToContextBudget(
      msgs,
      budget,
      estimateLm,
      isProtectedFn,
    );

    // msgs[0] is protected and retained; it's at index 0 in original array
    // droppedCount should be 0 (the first retained message is at index 0)
    assert.equal(droppedCount, 0);
  });

  it("droppedCount reflects correct separator position when protected messages are not at start", () => {
    // 5 messages: non-protected drop zone, then protected later in conversation
    // [0]=non-protected(10), [1]=non-protected(10), [2]=protected(5), [3]=non-protected(10), [4]=non-protected(10)
    // Budget = 35: protected(5) + non-protected tail = fill backward from idx 4
    //   idx 4: 10, total=15; idx 3: 10, total=25; idx 1: 10, total=35; idx 0: 10, total=45 > budget
    //   So keep: idx 4, idx 3, idx 1 (non-protected) = 30 tokens + protected idx 2 (5) = 35
    //   Drop: idx 0 only
    //   First retained in original order: idx 1 → droppedCount = 1
    const msgs = [
      lm("aaaaaaaaaa", false), // idx 0, 10 tokens, dropped
      lm("bbbbbbbbbb", false), // idx 1, 10 tokens, kept
      lm("ppppp", true), // idx 2, 5 tokens, protected
      lm("cccccccccc", false), // idx 3, 10 tokens, kept
      lm("dddddddddd", false), // idx 4, 10 tokens, kept
    ];
    const budget = 35;
    const { messages: result, droppedCount } = truncateToContextBudget(
      msgs,
      budget,
      estimateLm,
      isProtectedFn,
    );

    assert.ok(
      !result.includes(msgs[0]!),
      "oldest non-protected must be dropped",
    );
    assert.ok(result.includes(msgs[1]!), "msg[1] must be retained");
    assert.ok(result.includes(msgs[2]!), "protected msg[2] must be retained");
    assert.ok(result.includes(msgs[3]!), "msg[3] must be retained");
    assert.ok(result.includes(msgs[4]!), "msg[4] must be retained");
    // First retained is at original index 1 → droppedCount = 1
    assert.equal(droppedCount, 1);
  });

  it("retains all messages and droppedCount is 0 when all fit within budget", () => {
    const msgs = [
      lm("ppppp", true), // idx 0, 5 tokens
      lm("aaaaaaaaaa", false), // idx 1, 10 tokens
      lm("bbbbbbbbbb", false), // idx 2, 10 tokens
    ];
    const budget = 100; // plenty of room
    const { messages: result, droppedCount } = truncateToContextBudget(
      msgs,
      budget,
      estimateLm,
      isProtectedFn,
    );

    assert.deepEqual(result, msgs);
    assert.equal(droppedCount, 0);
  });

  it("output preserves original message order (protected interspersed with non-protected)", () => {
    // Protected at idx 0, non-protected at 1-4 with tight budget
    const msgs = [
      lm("ppppp", true), // idx 0, 5 tokens, protected
      lm("aaaaaaaaaa", false), // idx 1, 10 tokens
      lm("bbbbbbbbbb", false), // idx 2, 10 tokens
      lm("cccccccccc", false), // idx 3, 10 tokens
      lm("dddddddddd", false), // idx 4, 10 tokens
    ];
    // Budget = 25: protected(5) + 2 newest non-protected (20) = 25
    const budget = 25;
    const { messages: result } = truncateToContextBudget(
      msgs,
      budget,
      estimateLm,
      isProtectedFn,
    );

    // Should be in original order: [0, 3, 4]
    assert.deepEqual(result, [msgs[0], msgs[3], msgs[4]]);
  });

  it("backward compat: no isProtected behaves identically to original", () => {
    const msgs = [
      lm("aaaaaaaaaa", false), // idx 0
      lm("bbbbbbbbbb", false), // idx 1
      lm("cccccccccc", false), // idx 2
    ];
    // Without isProtected, drop oldest when budget only fits 2
    const budget = 20;
    const { messages: result, droppedCount } = truncateToContextBudget(
      msgs,
      budget,
      estimateLm,
    );

    assert.deepEqual(result, [msgs[1], msgs[2]]);
    assert.equal(droppedCount, 1);
  });
});
