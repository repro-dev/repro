import { map as mapFuture, resolve } from "fluture";
import { estimateTokens } from "../../model/token-optimization";
import {
  isAdvanceableInvestigationStage,
  normalizeHypotheses,
} from "../../investigationStage";
import type { ToolHandler } from "./common";
import { createError } from "./common";

type AdvanceStageArgs = {
  stage?: unknown;
  hypotheses?: unknown;
};

export const TOOL_DEFINITION = {
  type: "function",
  function: {
    name: "advanceStage",
    description:
      "Advance the investigation stage machine. Use this after orienting, when you have candidate hypotheses, when you start collecting evidence, and only move to conclusion after at least one hypothesis has non-empty evidence.",
    parameters: {
      type: "object",
      properties: {
        stage: {
          type: "string",
          enum: ["orient", "hypotheses", "evidence", "conclusion"],
          description: "Next investigation stage.",
        },
        hypotheses: {
          type: "array",
          description:
            "Optional hypotheses to store with the new stage. Each hypothesis must include id, description, and evidence.",
          items: {
            type: "object",
            properties: {
              id: { type: "string" },
              description: { type: "string" },
              evidence: {
                type: "array",
                items: { type: "string" },
              },
            },
            required: ["id", "description", "evidence"],
          },
        },
      },
      required: ["stage"],
    },
  },
};

function parseArgs(args: Record<string, unknown>) {
  const parsed = args as AdvanceStageArgs;

  if (!isAdvanceableInvestigationStage(parsed.stage)) {
    return {
      error: createError(
        "Invalid investigation stage",
        "The stage must be orient, hypotheses, evidence, or conclusion",
        "Call advanceStage with one of the supported forward stages.",
      ),
    };
  }

  if (!Object.prototype.hasOwnProperty.call(parsed, "hypotheses")) {
    return { stage: parsed.stage, hypotheses: undefined };
  }

  const hypotheses = normalizeHypotheses(parsed.hypotheses);
  if ("error" in hypotheses) {
    return { error: hypotheses.error };
  }

  return { stage: parsed.stage, hypotheses: hypotheses.hypotheses };
}

export const handler: ToolHandler = (_recording, args, context) => {
  const parsed = parseArgs(args);

  if ("error" in parsed) {
    return resolve(parsed.error);
  }

  if (context?.advanceStage === undefined) {
    return resolve(
      createError(
        "advanceStage is unavailable",
        "The runtime did not provide an investigation-stage callback",
        "Pass an `advanceStage` callback into the agentic runtime before using the advanceStage tool.",
      ),
    );
  }

  return context
    .advanceStage({
      stage: parsed.stage,
      hypotheses: parsed.hypotheses,
    })
    .pipe(
      mapFuture((value) => ({
        ...value,
        _tokenEstimate: estimateTokens(value),
      })),
    );
};
