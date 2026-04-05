import {
  ReactCommitEvent,
  ReduxDispatchEvent,
  SourceEventType,
  StateEventType,
  VueComponentUpdateEvent,
  VuexActionEvent,
  VuexMutationEvent,
  PiniaActionEvent,
} from "@repro/domain";
import { Box } from "@repro/tdl";
import { resolve } from "fluture";
import { estimateTokens } from "../token-optimization";
import { createError } from "./common";
import type { ToolHandler } from "./common";

const MAX_VALUE_CHARS = 5 * 1024; // 5 KB (counted in characters)

function truncateLargeValue(value: string): string {
  if (value.length <= MAX_VALUE_CHARS) return value;
  return value.slice(0, MAX_VALUE_CHARS) + " [truncated — value exceeded 5 KB]";
}

const VALID_FRAMEWORKS = ["react", "redux"] as const;
type Framework = (typeof VALID_FRAMEWORKS)[number];

export const TOOL_DEFINITION = {
  type: "function",
  function: {
    name: "getStateChanges",
    description:
      "Get React component render events and Redux dispatch events (including Vuex and Pinia) from the recording. Use this to trace UI re-renders, state mutations, and dispatched actions. Filter by framework, component name, action type, and time range.",
    parameters: {
      type: "object",
      properties: {
        framework: {
          type: "string",
          enum: ["react", "redux"],
          description:
            "Filter by framework. 'react' returns ReactCommit and VueComponentUpdate events. 'redux' returns ReduxDispatch, VuexMutation, VuexAction, and PiniaAction events. Omit to return all frameworks.",
        },
        componentName: {
          type: "string",
          description:
            "Filter React commits by component name (substring match). Has no effect on Redux/Vuex/Pinia events.",
        },
        actionType: {
          type: "string",
          description:
            "Filter Redux dispatches and Vuex mutations by action/mutation type (substring match). Has no effect on React events.",
        },
        timeRangeStartMs: {
          type: "number",
          description: "Start of time range in ms from recording start.",
        },
        timeRangeEndMs: {
          type: "number",
          description: "End of time range in ms from recording start.",
        },
        limit: {
          type: "number",
          description: "Maximum number of events to return (default 50).",
        },
      },
    },
  },
};

export const handler: ToolHandler = (recording, args) => {
  const frameworkArg = args.framework as string | undefined;
  const componentNameFilter = args.componentName as string | undefined;
  const actionTypeFilter = args.actionType as string | undefined;
  const timeRangeStartMs = args.timeRangeStartMs as number | undefined;
  const timeRangeEndMs = args.timeRangeEndMs as number | undefined;
  const limit = Math.max(1, (args.limit as number | undefined) ?? 50);

  // Validate framework against known values — reject early with a self-healing error.
  if (
    frameworkArg !== undefined &&
    !(VALID_FRAMEWORKS as readonly string[]).includes(frameworkArg)
  ) {
    return resolve(
      createError(
        `Unknown framework: "${frameworkArg}"`,
        `The framework parameter must be one of: ${VALID_FRAMEWORKS.map(
          (f) => `'${f}'`,
        ).join(", ")}`,
        `Call getStateChanges() with framework='react' or framework='redux', or omit the framework parameter to return all state events.`,
      ),
    );
  }

  const framework = frameworkArg as Framework | undefined;

  // Delegate time-range filtering to getEventsByType — avoids a second scan.
  const sourceEvents = recording.getEventsByType([SourceEventType.State], {
    startMs: timeRangeStartMs,
    endMs: timeRangeEndMs,
  });

  const events: Array<Record<string, unknown>> = [];
  let total = 0;

  for (const sourceEvent of sourceEvents) {
    const time = (sourceEvent as Box<{ time: number }>).get("time").orElse(0);

    // The SourceEvent data field is itself a Box (StateEvent = Box<...>).
    // .get("data") returns Box<Box<StateEventData>>; .flat() unwraps one level
    // so that .apply() receives the plain state event object.
    const dataBox = (sourceEvent as Box<{ data: Box<unknown> }>)
      .get("data")
      .flat() as Box<
      | ReactCommitEvent
      | ReduxDispatchEvent
      | VueComponentUpdateEvent
      | VuexMutationEvent
      | VuexActionEvent
      | PiniaActionEvent
    >;

    let entry: Record<string, unknown> | null = null;

    dataBox.apply((stateEvent) => {
      const eventType = stateEvent.type;

      if (eventType === StateEventType.ReactCommit) {
        const e = stateEvent as ReactCommitEvent;

        // Framework filter: react covers ReactCommit
        if (framework === "redux") return;

        // componentName substring filter
        if (
          componentNameFilter !== undefined &&
          !e.componentName.includes(componentNameFilter)
        )
          return;

        entry = {
          time,
          framework: "react",
          eventType: "ReactCommit",
          componentName: e.componentName,
          propsDelta: truncateLargeValue(e.propsDelta),
          hooksDelta: truncateLargeValue(e.hooksDelta),
          fiberNodeId: e.fiberNodeId,
          ...(e.parentFiberId !== null
            ? { parentFiberId: e.parentFiberId }
            : {}),
          ...(e.commitBatchId !== null
            ? { commitBatchId: e.commitBatchId }
            : {}),
        };
      } else if (eventType === StateEventType.VueComponentUpdate) {
        const e = stateEvent as VueComponentUpdateEvent;

        // Framework filter: react covers VueComponentUpdate
        if (framework === "redux") return;

        // componentName substring filter
        if (
          componentNameFilter !== undefined &&
          !e.componentName.includes(componentNameFilter)
        )
          return;

        entry = {
          time,
          framework: "react",
          eventType: "VueComponentUpdate",
          componentName: e.componentName,
          uid: e.uid,
          propsDelta: truncateLargeValue(e.propsDelta),
          setupStateDelta: truncateLargeValue(e.setupStateDelta),
        };
      } else if (eventType === StateEventType.ReduxDispatch) {
        const e = stateEvent as ReduxDispatchEvent;

        // Framework filter: redux covers ReduxDispatch
        if (framework === "react") return;

        // actionType substring filter
        if (
          actionTypeFilter !== undefined &&
          !e.actionType.includes(actionTypeFilter)
        )
          return;

        entry = {
          time,
          framework: "redux",
          eventType: "ReduxDispatch",
          actionType: e.actionType,
          actionPayload: truncateLargeValue(e.actionPayload),
          stateDiff: truncateLargeValue(e.stateDiff),
        };
      } else if (eventType === StateEventType.VuexMutation) {
        const e = stateEvent as VuexMutationEvent;

        // Framework filter: redux covers VuexMutation
        if (framework === "react") return;

        // actionType filter applies to mutationType
        if (
          actionTypeFilter !== undefined &&
          !e.mutationType.includes(actionTypeFilter)
        )
          return;

        entry = {
          time,
          framework: "redux",
          eventType: "VuexMutation",
          mutationType: e.mutationType,
          payload: truncateLargeValue(e.payload),
          stateDiff: truncateLargeValue(e.stateDiff),
        };
      } else if (eventType === StateEventType.VuexAction) {
        const e = stateEvent as VuexActionEvent;

        // Framework filter: redux covers VuexAction
        if (framework === "react") return;

        // actionType filter applies to actionType
        if (
          actionTypeFilter !== undefined &&
          !e.actionType.includes(actionTypeFilter)
        )
          return;

        entry = {
          time,
          framework: "redux",
          eventType: "VuexAction",
          actionType: e.actionType,
          payload: truncateLargeValue(e.payload),
        };
      } else if (eventType === StateEventType.PiniaAction) {
        const e = stateEvent as PiniaActionEvent;

        // Framework filter: redux covers PiniaAction
        if (framework === "react") return;

        // actionType filter applies to actionName
        if (
          actionTypeFilter !== undefined &&
          !e.actionName.includes(actionTypeFilter)
        )
          return;

        entry = {
          time,
          framework: "redux",
          eventType: "PiniaAction",
          storeId: e.storeId,
          actionName: e.actionName,
          args: truncateLargeValue(e.args),
          stateDiff: truncateLargeValue(e.stateDiff),
        };
      }
    });

    if (entry !== null) {
      total++;
      if (events.length < limit) {
        events.push(entry);
      }
    }
  }

  const hasFilters =
    framework !== undefined ||
    componentNameFilter !== undefined ||
    actionTypeFilter !== undefined ||
    timeRangeStartMs !== undefined ||
    timeRangeEndMs !== undefined;

  if (events.length === 0) {
    const hint =
      total === 0 && !hasFilters
        ? 'No state change events found in this recording. The app may not use React, Redux, Vue, or Pinia, or the state observer may not have been active. Call getEvents(detail="summary") to inspect which event types are present.'
        : "No state changes matched the provided filters. Call getStateChanges() without filters to see all available state events.";
    return resolve({
      events: [],
      total: 0,
      _hint: hint,
      _tokenEstimate: estimateTokens({ events: [], total: 0 }),
    });
  }

  const result = { events, total };
  return resolve({ ...result, _tokenEstimate: estimateTokens(result) });
};
