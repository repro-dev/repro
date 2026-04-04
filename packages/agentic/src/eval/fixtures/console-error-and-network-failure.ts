import { NodeId, NodeType, Snapshot } from "@repro/domain";
import { Box } from "@repro/tdl";
import {
  makeAccessor,
  makeClickEvent,
  makeConsoleErrorEvent,
  makeConsoleInfoEvent,
  makeFetchRequestEvent,
  makeFetchResponseEvent,
  makePageTransitionEvent,
  makeSnapshotEvent,
} from "../../model/tools/__tests__/helpers";
import { EXTENSION_SYSTEM_CARD_MESSAGE } from "../../model/system";
import { EvalFixture } from "../runner";

// Fixture: a button click triggers a POST /api/submit request that returns 500,
// followed immediately by a TypeError in handleSubmit.
// Exercises: findErrors, getConsoleMessages, getNetworkRequests, getDOMState
export function createFixture(): EvalFixture {
  const FORM_ID = "frm01";
  const BUTTON_ID = "btn01";

  // Snapshot at t=1000: a simple form page with a submit button
  function snapshotFn(timestampMs: number): Snapshot | null {
    if (timestampMs < 1000) {
      return null;
    }

    return {
      dom: {
        rootId: "root",
        nodes: {
          root: new Box({
            type: NodeType.Document as NodeType.Document,
            id: "root" as NodeId,
            parentId: null,
            children: ["body"] as NodeId[],
          }),
          body: new Box({
            type: NodeType.Element as NodeType.Element,
            id: "body" as NodeId,
            parentId: "root" as NodeId,
            tagName: "body",
            children: [FORM_ID] as NodeId[],
            attributes: {} as Record<string, string | null>,
            properties: { value: null, checked: null, selectedIndex: null },
            shadowRoot: false,
          }),
          [FORM_ID]: new Box({
            type: NodeType.Element as NodeType.Element,
            id: FORM_ID as NodeId,
            parentId: "body" as NodeId,
            tagName: "form",
            children: [BUTTON_ID] as NodeId[],
            attributes: {
              id: "submit-form",
            } as Record<string, string | null>,
            properties: { value: null, checked: null, selectedIndex: null },
            shadowRoot: false,
          }),
          [BUTTON_ID]: new Box({
            type: NodeType.Element as NodeType.Element,
            id: BUTTON_ID as NodeId,
            parentId: FORM_ID as NodeId,
            tagName: "button",
            children: [] as NodeId[],
            attributes: {
              type: "submit",
              "aria-label": "Submit",
            } as Record<string, string | null>,
            properties: { value: null, checked: null, selectedIndex: null },
            shadowRoot: false,
          }),
        },
      },
      interaction: null,
      frameworkState: null,
    };
  }

  const events = [
    makePageTransitionEvent(500, "https://app.example.com/form"),
    makeConsoleInfoEvent(1000, "Form loaded"),
    // Snapshot at t=1000 establishes form page state
    makeSnapshotEvent(1000),
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

  const accessor = makeAccessor(events, 5000, snapshotFn);

  return {
    name: "console-error-and-network-failure",
    prompt:
      "The submit button on the form page seems to be broken. What went wrong?",
    expectedOutcomeDescription:
      "The agent correctly identifies that the POST /api/submit request returned a 500 error and a TypeError was thrown in handleSubmit at form.js:42, likely because the server response was undefined when the handler tried to access .id",
    accessor,
    systemPrompt: EXTENSION_SYSTEM_CARD_MESSAGE,
    promptExportName: "EXTENSION_SYSTEM_CARD_MESSAGE",
  };
}
