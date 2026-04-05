import { SourceEventType, StorageOperation, StorageType } from "@repro/domain";
import { Box } from "@repro/tdl";
import { resolve } from "fluture";
import { estimateTokens } from "../token-optimization";
import { createError } from "./common";
import type { ToolHandler } from "./common";

// Maximum byte length for individual storage values. Values exceeding this
// threshold are truncated to avoid flooding the agent context window.
const MAX_VALUE_BYTES = 2048;

function truncateValue(value: string | null): {
  value: string | null;
  truncated: boolean;
} {
  if (value === null) return { value: null, truncated: false };
  if (value.length <= MAX_VALUE_BYTES) return { value, truncated: false };
  // Append an ellipsis to signal that the value was cut short.
  return { value: value.slice(0, MAX_VALUE_BYTES) + "…", truncated: true };
}

const STORAGE_TYPE_NAMES: Record<number, string> = {
  [StorageType.localStorage]: "localStorage",
  [StorageType.sessionStorage]: "sessionStorage",
};

const STORAGE_OPERATION_NAMES: Record<number, string> = {
  [StorageOperation.setItem]: "setItem",
  [StorageOperation.removeItem]: "removeItem",
  [StorageOperation.clear]: "clear",
};

export const TOOL_DEFINITION = {
  type: "function",
  function: {
    name: "getStorageChanges",
    description:
      "Get recorded localStorage/sessionStorage mutation events from the recording. Returns storage changes including the operation type, key, old value, and new value for each mutation.",
    parameters: {
      type: "object",
      properties: {
        storageType: {
          type: "string",
          enum: ["localStorage", "sessionStorage"],
          description: "Filter by storage type. Omit to return both.",
        },
        key: {
          type: "string",
          description:
            "Filter by storage key (substring match). Omit to return all keys.",
        },
        startTime: {
          type: "number",
          description: "Start of time range in ms from recording start.",
        },
        endTime: {
          type: "number",
          description: "End of time range in ms from recording start.",
        },
        limit: {
          type: "number",
          description: "Maximum number of results to return. Defaults to 50.",
        },
      },
    },
  },
};

export const handler: ToolHandler = (recording, args) => {
  const storageTypeFilter = args.storageType as string | undefined;
  const keyFilter = args.key as string | undefined;
  const startTime = args.startTime as number | undefined;
  const endTime = args.endTime as number | undefined;
  const limit = (args.limit as number | undefined) ?? 50;

  try {
    // Resolve storageType enum value from the filter string, if provided.
    let storageTypeValue: StorageType | undefined;
    if (storageTypeFilter === "localStorage") {
      storageTypeValue = StorageType.localStorage;
    } else if (storageTypeFilter === "sessionStorage") {
      storageTypeValue = StorageType.sessionStorage;
    }

    // Fetch all storage events in range first — limit is applied AFTER
    // storageType/key filters so it counts against the filtered result set,
    // not the unfiltered one (matches get-network-requests.ts pattern).
    const rawEvents = recording.getEventsByType([SourceEventType.Storage], {
      startMs: startTime,
      endMs: endTime,
    });

    type Change = {
      time: number;
      storageType: string;
      operation: string;
      key: string | null;
      oldValue: string | null;
      newValue: string | null;
      _valueTruncated?: true;
    };

    const changes: Change[] = [];

    for (const event of rawEvents) {
      // StorageEvent wraps a plain StorageMessage struct (not a union).
      // Access fields directly via Box.get() chaining.
      const e = event as Box<{
        type: number;
        time: number;
        data: {
          storageType: StorageType;
          operation: StorageOperation;
          key: string | null;
          oldValue: string | null;
          newValue: string | null;
          frameId: number;
        };
      }>;

      const data = e.get("data");
      const rawStorageType = data
        .get("storageType")
        .orElse(StorageType.localStorage);
      const operation = data.get("operation").orElse(StorageOperation.setItem);
      const key = data.get("key").orElse(null);
      const rawOldValue = data.get("oldValue").orElse(null);
      const rawNewValue = data.get("newValue").orElse(null);
      const time = e.get("time").orElse(0);

      // Apply storageType filter
      if (
        storageTypeValue !== undefined &&
        rawStorageType !== storageTypeValue
      ) {
        continue;
      }

      // Apply key filter (substring match; events with null key are excluded
      // when a key filter is active)
      if (keyFilter !== undefined) {
        if (key === null || !key.includes(keyFilter)) {
          continue;
        }
      }

      const { value: oldValue, truncated: oldTruncated } =
        truncateValue(rawOldValue);
      const { value: newValue, truncated: newTruncated } =
        truncateValue(rawNewValue);
      const didTruncate = oldTruncated || newTruncated;

      const change: Change = {
        time,
        storageType: STORAGE_TYPE_NAMES[rawStorageType] ?? "localStorage",
        operation: STORAGE_OPERATION_NAMES[operation] ?? "setItem",
        key,
        oldValue,
        newValue,
      };

      if (didTruncate) {
        change._valueTruncated = true;
      }

      changes.push(change);
    }

    // Apply limit after all filtering — consistent with get-network-requests.ts
    const limitedChanges = changes.slice(0, limit);

    const hasFilters =
      storageTypeFilter !== undefined ||
      keyFilter !== undefined ||
      startTime !== undefined ||
      endTime !== undefined;

    const result = { changes: limitedChanges, total: limitedChanges.length };

    if (limitedChanges.length === 0 && hasFilters) {
      return resolve({
        ...result,
        _hint:
          "No storage changes matched the provided filters. Call getStorageChanges() without filters to see all available storage changes.",
        _tokenEstimate: estimateTokens(result),
      });
    }

    return resolve({ ...result, _tokenEstimate: estimateTokens(result) });
  } catch (err) {
    return resolve(
      createError(
        "getStorageChanges failed to retrieve storage events",
        "The recording accessor threw an unexpected error — the recording may be corrupt or the event data may be malformed",
        'Call getEvents(detail="summary") to verify the recording contains Storage events, then retry getStorageChanges() without filters',
      ),
    );
  }
};
