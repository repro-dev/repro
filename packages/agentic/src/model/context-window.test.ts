import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  computeContextBudget,
  truncateToContextBudget,
} from "./context-window";

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
