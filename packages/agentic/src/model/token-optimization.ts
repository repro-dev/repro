export type DetailLevel = "summary" | "normal" | "full";

export interface TimeRangeParams {
  timeRangeStartMs?: number;
  timeRangeEndMs?: number;
}

export interface PaginationParams {
  limit?: number;
}

export interface PaginatedResponse {
  hasMore?: boolean;
  _hint?: string;
}

export interface TokenEstimatedResponse {
  _tokenEstimate: number;
}

// Cached tokenizer module reference. `null` means unavailable after one attempt.
let tokenizerModule:
  | { countTokens: (text: string) => number }
  | null
  | undefined = undefined;

function loadTokenizer(): { countTokens: (text: string) => number } | null {
  if (tokenizerModule !== undefined) return tokenizerModule;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    tokenizerModule = require("@anthropic-ai/tokenizer") as {
      countTokens: (text: string) => number;
    };
  } catch {
    tokenizerModule = null;
  }
  return tokenizerModule;
}

export function estimateTokens(response: unknown): number {
  const text = JSON.stringify(response);
  try {
    const mod = loadTokenizer();
    if (mod) {
      return mod.countTokens(text);
    }
  } catch {
    // Fall through to heuristic on unexpected tokenizer errors
  }
  // Heuristic fallback: ~4 chars per token on average; ceil to avoid undercounting
  return Math.ceil(text.length / 4);
}

export function shortenStackFrame(frame: string): string {
  const match = frame.match(
    /([^/]+\.(?:tsx|jsx|mjs|cjs|ts|js))(?::(\d+)(?::(\d+))?)?/,
  );
  if (match) {
    const parts = [match[1]];
    if (match[2]) parts.push(match[2]);
    if (match[3]) parts.push(match[3]);
    return parts.join(":");
  }
  return frame;
}

export function shortenUrl(
  url: string,
  mode: "pathname" | "full" = "pathname",
): string {
  if (mode === "full") return url;
  try {
    const parsed = new URL(url);
    return parsed.pathname + parsed.search;
  } catch {
    return url;
  }
}

export function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  return str.slice(0, maxLength - 1) + "…";
}

export const TOKEN_BUDGETS = {
  summary: 500,
  normal: 2000,
  full: 8000,
} as const;
