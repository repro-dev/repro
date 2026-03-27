import {
  makeAccessor,
  makeClickEvent,
  makeConsoleErrorEvent,
  makeConsoleInfoEvent,
  makeFetchRequestEvent,
  makeFetchResponseEvent,
  makePageTransitionEvent,
} from "../../model/tools/__tests__/helpers";
import { RecordingDataAccessor } from "../../types";

export interface EvalFixture {
  name: string;
  prompt: string;
  expectedOutcomeDescription: string;
  accessor: RecordingDataAccessor;
}

// Fixture: a button click triggers a POST /api/submit request that returns 500,
// followed immediately by a TypeError in handleSubmit.
// Exercises: findErrors, getConsoleMessages, getNetworkRequests
export function createFixture(): EvalFixture {
  const events = [
    makePageTransitionEvent(500, "https://app.example.com/form"),
    makeConsoleInfoEvent(1000, "Form loaded"),
    makeClickEvent(2000, "Submit"),
    makeFetchRequestEvent(
      2100,
      "req1",
      "https://api.example.com/api/submit",
      "POST",
    ),
    makeFetchResponseEvent(2300, "req1", 500),
    makeConsoleErrorEvent(
      2310,
      "Uncaught TypeError: Cannot read properties of undefined (reading 'id')",
      [
        {
          functionName: "handleSubmit",
          fileName: "form.js",
          lineNumber: 42,
          columnNumber: 12,
        },
      ],
    ),
  ];

  const accessor = makeAccessor(events, 5000);

  return {
    name: "console-error-and-network-failure",
    prompt:
      "The submit button on the form page seems to be broken. What went wrong?",
    expectedOutcomeDescription:
      "The agent correctly identifies that the POST /api/submit request returned a 500 error and a TypeError was thrown in handleSubmit at form.js:42, likely because the server response was undefined when the handler tried to access .id",
    accessor,
  };
}
