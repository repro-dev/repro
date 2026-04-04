import { spacing } from "@repro/design";

export const PLACEHOLDER_COPY = [
  "What is causing this bug?",
  "Why are the network requests failing?",
  "Explain the console errors - and how do I fix them?",
];

// Shown when the user is replying to an ongoing conversation rather than starting fresh
export const REPLY_PLACEHOLDER = "Write your reply\u2026";

export const GUTTER_PX = spacing["2xl"];
export const LOADING_CONTAINER_OFFSET_PX = 24 + 2 * GUTTER_PX;
export const INPUT_CONTAINER_OFFSET_PX = 97 + 2 * GUTTER_PX;
export const SCROLL_OFFSET_THRESHOLD_PX = 2 * GUTTER_PX;
