import {
  makeAccessor,
  makeClickEvent,
  makeConsoleInfoEvent,
  makePageTransitionEvent,
} from "../../model/tools/__tests__/helpers";
import { EXTENSION_SYSTEM_CARD_MESSAGE } from "../../model/system";
import { EvalFixture } from "../runner";

// Fixture: the user clicks "Place Order" on the checkout page, but client-side
// validation silently blocks the submission without showing an error message.
// No network request is ever made. The agent must identify the silent
// validation failure from the console info log and the absence of a request.
// Exercises: getNetworkRequests, getConsoleMessages, getInteractionEvents
export function createFixture(): EvalFixture {
  const events = [
    makePageTransitionEvent(500, "https://app.example.com/checkout"),
    makeConsoleInfoEvent(1000, "Checkout form ready"),
    makeClickEvent(5000, "Place Order"),
    // No network request — validation cancelled the submission before it fired
    makeConsoleInfoEvent(5010, "Validation failed: required fields missing"),
  ];

  const accessor = makeAccessor(events, 10000);

  return {
    name: "form-validation-silent-failure",
    prompt:
      "The user clicked 'Place Order' on the checkout page but nothing happened — no confirmation, no error message. What's wrong?",
    expectedOutcomeDescription:
      "The agent identifies that clicking 'Place Order' at 5.0s did not trigger any network request, and a console info message logged immediately after indicates that client-side validation failed due to missing required fields. The order was silently blocked before being submitted to the server, and no error was shown to the user.",
    accessor,
    systemPrompt: EXTENSION_SYSTEM_CARD_MESSAGE,
    promptExportName: "EXTENSION_SYSTEM_CARD_MESSAGE",
  };
}
