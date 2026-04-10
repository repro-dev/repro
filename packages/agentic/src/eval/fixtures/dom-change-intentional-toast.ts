import { NodeId, NodeType, Snapshot } from "@repro/domain";
import { Box } from "@repro/tdl";
import {
  makeAccessor,
  makeAddNodesPatchEvent,
  makeClickEvent,
  makeConsoleErrorEvent,
  makeFetchRequestEvent,
  makeFetchResponseEvent,
  makePageTransitionEvent,
  makeRemoveNodesPatchEvent,
  makeSnapshotEvent,
} from "../../model/tools/__tests__/helpers";
import { EXTENSION_SYSTEM_CARD_MESSAGE } from "../../model/system";
import { EvalFixture } from "../runner";

// Fixture: a DOM add-then-remove sequence occurs (an error toast notification
// triggered by the failed save), but the actual bug is the 500 from PUT
// /api/profile. The agent must use the error path (500 + TypeError), not the
// DOM change path, to explain the user's complaint that data wasn't saved.
// Exercises: getNetworkRequests, findErrors, getDOMDiff, getDOMState
export function createFixture(): EvalFixture {
  const FORM_ID = "form01";
  const BUTTON_ID = "btn01";
  const TOAST_ID = "toast01";

  // Snapshot at t=1000: a simple profile page with an Update Profile button
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
            attributes: {} as Record<string, string | null>,
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
              "aria-label": "Update Profile",
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
    makePageTransitionEvent(500, "https://app.example.com/profile"),
    makeSnapshotEvent(1000),
    makeClickEvent(3000, "Update Profile"),
    makeFetchRequestEvent(
      3100,
      "req1",
      "https://api.example.com/api/profile",
      "PUT",
    ),
    makeFetchResponseEvent(3400, "req1", 500),
    makeConsoleErrorEvent(
      3410,
      'Uncaught TypeError: Cannot read properties of undefined (reading "success")',
      [
        {
          functionName: "handleProfileUpdate",
          fileName: "profile.js",
          lineNumber: 56,
          columnNumber: 14,
        },
      ],
    ),
    // Error toast appears then disappears — these are incidental DOM changes
    // caused by the error handling path, not the root cause of the failure
    makeAddNodesPatchEvent(3500, "body", [TOAST_ID]),
    makeRemoveNodesPatchEvent(5000, "body", [TOAST_ID]),
  ];

  const accessor = makeAccessor(events, 8000, snapshotFn);

  return {
    name: "dom-change-intentional-toast",
    prompt:
      "I clicked 'Update Profile' but my changes weren't saved. What happened?",
    expectedOutcomeDescription:
      "The agent identifies that clicking 'Update Profile' at 3.0s triggered a PUT /api/profile request that returned a 500 at 3.4s, followed immediately by a TypeError in handleProfileUpdate at profile.js:56. The DOM changes (a brief element appearing and disappearing around 3.5–5.0s) are consistent with an error notification toast triggered by the failed save, not a conditional rendering bug.",
    accessor,
    systemPrompt: EXTENSION_SYSTEM_CARD_MESSAGE,
    promptExportName: "EXTENSION_SYSTEM_CARD_MESSAGE",
  };
}
