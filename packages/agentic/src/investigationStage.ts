import type {
  AdvanceStageError,
  AdvanceStageResult,
  Hypothesis,
  InvestigationReadiness,
  InvestigationStage,
} from "./types";

const INVESTIGATION_STAGE_ORDER: Array<InvestigationStage> = [
  "idle",
  "orient",
  "hypotheses",
  "evidence",
  "conclusion",
];

const ADVANCEABLE_INVESTIGATION_STAGES: Array<
  Exclude<InvestigationStage, "idle">
> = ["orient", "hypotheses", "evidence", "conclusion"];

export function isInvestigationStage(
  value: unknown,
): value is InvestigationStage {
  return (
    typeof value === "string" &&
    (INVESTIGATION_STAGE_ORDER as Array<string>).includes(value)
  );
}

export function isAdvanceableInvestigationStage(
  value: unknown,
): value is Exclude<InvestigationStage, "idle"> {
  return (
    typeof value === "string" &&
    (ADVANCEABLE_INVESTIGATION_STAGES as Array<string>).includes(value)
  );
}

export function hasSupportedHypothesis(hypotheses: Array<Hypothesis>): boolean {
  return hypotheses.some((hypothesis) => hypothesis.evidence.length > 0);
}

export function getInvestigationReadiness(
  hypotheses: Array<Hypothesis>,
): InvestigationReadiness {
  return hasSupportedHypothesis(hypotheses)
    ? "ready to conclude"
    : "needs more evidence";
}

export function normalizeHypotheses(
  value: unknown,
): { hypotheses: Array<Hypothesis> } | { error: AdvanceStageError } {
  if (value === undefined) {
    return { hypotheses: [] };
  }

  if (!Array.isArray(value)) {
    return {
      error: {
        error: "Invalid hypotheses payload",
        reason: "The hypotheses value must be an array",
        suggestion:
          "Call advanceStage with hypotheses as an array of { id, description, evidence } objects.",
      },
    };
  }

  const hypotheses: Array<Hypothesis> = [];

  for (const item of value) {
    if (item === null || typeof item !== "object") {
      return {
        error: {
          error: "Invalid hypothesis",
          reason: "Each hypothesis must be an object",
          suggestion:
            "Provide hypotheses as objects with id, description, and evidence fields.",
        },
      };
    }

    const record = item as Record<string, unknown>;
    const id = record.id;
    const description = record.description;
    const evidence = record.evidence;

    if (
      typeof id !== "string" ||
      id.trim() === "" ||
      typeof description !== "string" ||
      description.trim() === "" ||
      !Array.isArray(evidence) ||
      evidence.some((entry) => typeof entry !== "string" || entry.trim() === "")
    ) {
      return {
        error: {
          error: "Invalid hypothesis",
          reason:
            "Each hypothesis must include a non-empty id, description, and string evidence list",
          suggestion:
            "Trim the hypothesis fields and ensure evidence is an array of non-empty strings.",
        },
      };
    }

    hypotheses.push({
      id: id.trim(),
      description: description.trim(),
      evidence: evidence.map((entry) => entry.trim()),
    });
  }

  return { hypotheses };
}

export function validateInvestigationStageTransition(
  currentStage: InvestigationStage,
  nextStage: Exclude<InvestigationStage, "idle">,
  hypotheses: Array<Hypothesis>,
):
  | { ok: true; result: AdvanceStageResult }
  | { ok: false; error: AdvanceStageError } {
  const currentStageIndex = INVESTIGATION_STAGE_ORDER.indexOf(currentStage);
  const nextStageIndex = INVESTIGATION_STAGE_ORDER.indexOf(nextStage);

  if (nextStageIndex === -1) {
    return {
      ok: false,
      error: {
        error: "Invalid investigation stage",
        reason: `Unknown stage: ${nextStage}`,
        suggestion:
          "Call advanceStage with orient, hypotheses, evidence, or conclusion.",
      },
    };
  }

  if (nextStageIndex < currentStageIndex) {
    return {
      ok: false,
      error: {
        error: "Backward stage transition blocked",
        reason: `${currentStage} cannot move back to ${nextStage}`,
        suggestion:
          "Advance the investigation in order, or repeat the current stage with updated hypotheses.",
      },
    };
  }

  if (nextStageIndex > currentStageIndex + 1) {
    return {
      ok: false,
      error: {
        error: "Skipped stage transition blocked",
        reason: `${currentStage} cannot skip directly to ${nextStage}`,
        suggestion:
          "Call advanceStage for the next stage in sequence before moving ahead.",
      },
    };
  }

  if (nextStage === "conclusion" && !hasSupportedHypothesis(hypotheses)) {
    return {
      ok: false,
      error: {
        error: "Conclusion requires evidence",
        reason: "No hypothesis has non-empty evidence yet",
        suggestion:
          "Collect evidence for at least one hypothesis, then call advanceStage({ stage: 'conclusion' }).",
      },
    };
  }

  return {
    ok: true,
    result: {
      stage: nextStage,
      hypotheses,
      readiness: getInvestigationReadiness(hypotheses),
    },
  };
}
