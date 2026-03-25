import { NodeType } from "@repro/domain";
import { Box } from "@repro/tdl";
import { buildA11yTree, formatA11yTree } from "@repro/vdom-utils";
import { estimateTokens } from "../token-optimization";
import { createError } from "./common";
import type { ToolHandler } from "./common";

export const TOOL_DEFINITION = {
  type: "function",
  function: {
    name: "getDOMState",
    description:
      "Get the state of the DOM at a specific timestamp, either as an accessibility tree (a11y mode) or a summary of element counts (summary mode).",
    parameters: {
      type: "object",
      properties: {
        timestampMs: {
          type: "number",
          description:
            "Timestamp in milliseconds from the start of the recording.",
        },
        mode: {
          type: "string",
          enum: ["a11y", "summary"],
          default: "a11y",
          description:
            'The mode for DOM state output. Use "a11y" for accessibility tree, "summary" for element counts.',
        },
      },
    },
  },
};

export const handler: ToolHandler = (recording, args) => {
  const timestampMs = (args.timestampMs as number) ?? 0;
  const mode = (args.mode as string) ?? "a11y";
  const snapshot = recording.getSnapshotAtTime(timestampMs);

  if (!snapshot || !snapshot.dom) {
    const err = createError(
      "No DOM snapshot available at this timestamp",
      "The timestamp may be outside the recording range or no DOM snapshot was captured at this point",
      "Call getRecordingDuration() to get the valid recording time range, then retry with a timestamp within that range",
    );
    return { ...err, _tokenEstimate: estimateTokens(err) };
  }

  const vtree = snapshot.dom;

  if (mode === "a11y") {
    const tree = buildA11yTree(vtree);

    if (!tree) {
      const err = createError(
        "Could not build accessibility tree",
        "The DOM snapshot may be incomplete or corrupted at this timestamp",
        'Retry with mode: "summary" for a lighter-weight view, or try a different timestamp using getRecordingDuration() to find a valid range',
      );
      return { ...err, _tokenEstimate: estimateTokens(err) };
    }

    const formatted = formatA11yTree(tree);
    const result = { mode: "a11y" as const, tree: formatted, timestampMs };
    return { ...result, _tokenEstimate: estimateTokens(result) };
  }

  let elementCount = 0;
  let textCount = 0;
  const tagCounts: Record<string, number> = {};

  for (const node of Object.values(vtree.nodes)) {
    if (node.match((n) => n.type === NodeType.Element)) {
      elementCount++;
      const tagName = (
        node as Box<{ type: typeof NodeType.Element; tagName: string }>
      )
        .get("tagName")
        .orElse("unknown");
      tagCounts[tagName] = (tagCounts[tagName] ?? 0) + 1;
    } else if (node.match((n) => n.type === NodeType.Text)) {
      textCount++;
    }
  }

  const topTags = Object.entries(tagCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([tag, count]) => ({ tag, count }));

  const result = {
    mode: "summary" as const,
    elementCount,
    textCount,
    topTags,
    timestampMs,
  };
  return { ...result, _tokenEstimate: estimateTokens(result) };
};
