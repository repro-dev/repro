import {
  makeAccessor,
  makeClickEvent,
  makeConsoleInfoEvent,
  makeFetchRequestEvent,
  makeFetchResponseEvent,
  makePageTransitionEvent,
} from "../../model/tools/__tests__/helpers";
import { EXTENSION_SYSTEM_CARD_MESSAGE } from "../../model/system";
import { EvalFixture } from "../runner";

// Fixture: user clicks Save on the settings page; the POST returns a 500 but
// no JavaScript error is thrown — the app silently swallows the error via a
// .catch() that does not rethrow. The agent must identify the network failure
// even in the absence of any console error.
// Exercises: getNetworkRequests, getConsoleMessages, getInteractionEvents
export function createFixture(): EvalFixture {
  const events = [
    makePageTransitionEvent(500, "https://app.example.com/settings"),
    makeConsoleInfoEvent(1000, "Settings page loaded"),
    makeClickEvent(3000, "Save"),
    makeFetchRequestEvent(
      3100,
      "req1",
      "https://api.example.com/api/settings",
      "POST",
    ),
    makeFetchResponseEvent(3400, "req1", 500),
    // No console error — the app swallows the failure
  ];

  const accessor = makeAccessor(events, 8000);

  return {
    name: "network-failure-no-console-error",
    prompt:
      "The user clicked Save on the settings page but their changes don't seem to have been saved. What went wrong?",
    expectedOutcomeDescription:
      "The agent identifies that clicking Save triggered a POST /api/settings request that returned a 500 error at around 3.4s, indicating a server-side failure. No JavaScript exception was thrown, suggesting the error was silently swallowed by the client.",
    accessor,
    systemPrompt: EXTENSION_SYSTEM_CARD_MESSAGE,
    promptExportName: "EXTENSION_SYSTEM_CARD_MESSAGE",
  };
}
