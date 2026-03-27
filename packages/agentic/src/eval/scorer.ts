import { AssistantMessage, Entry, ToolMessage } from "../types";
import { MAX_TOOL_ITERATIONS } from "../createState";

export interface EvalScore {
  // LLM-as-judge: did the agent correctly identify the bug?
  correct: boolean;
  // The judge's reasoning for the correct/incorrect decision
  judgeReasoning: string;
  // Total tool calls made across all assistant messages
  iterationDepth: number;
  // Fraction (0–1) of tool calls that returned an error object
  toolErrorRate: number;
  // Whether the iteration limit was hit (MAX_TOOL_ITERATIONS)
  hitIterationLimit: boolean;
}

// Extracts the final assistant response from an entry list.
// Returns empty string if no assistant message with content is found.
function extractFinalAssistantResponse(entries: Array<Entry>): string {
  let finalResponse = "";
  for (const entry of entries) {
    if (entry.role === "assistant" && entry.content !== "") {
      finalResponse = entry.content;
    }
  }
  return finalResponse;
}

// Counts the total number of tool calls across all assistant messages.
function countToolCalls(entries: Array<Entry>): number {
  let total = 0;
  for (const entry of entries) {
    if (entry.role === "assistant") {
      total += (entry as AssistantMessage).toolCalls.length;
    }
  }
  return total;
}

// Counts the number of tool messages whose content (parsed as JSON) has an
// "error" key — indicating the tool returned an error response.
function countToolErrors(entries: Array<Entry>): number {
  let errors = 0;
  for (const entry of entries) {
    if (entry.role === "tool") {
      const toolMsg = entry as ToolMessage;
      if (typeof toolMsg.content === "string") {
        try {
          const parsed = JSON.parse(toolMsg.content) as unknown;
          if (
            parsed !== null &&
            typeof parsed === "object" &&
            "error" in (parsed as object)
          ) {
            errors++;
          }
        } catch {
          // Not JSON — not an error response
        }
      }
    }
  }
  return errors;
}

// Checks whether the iteration limit was hit by looking for the sentinel
// message text that buildIterationLimitMessage() produces.
function checkIterationLimitHit(entries: Array<Entry>): boolean {
  for (const entry of entries) {
    if (
      entry.role === "assistant" &&
      entry.content.includes("iteration limit")
    ) {
      return true;
    }
  }
  return false;
}

interface JudgeResponse {
  correct: boolean;
  reasoning: string;
}

async function callOpenRouterForJudgement(
  finalAssistantResponse: string,
  expectedOutcomeDescription: string,
  apiKey: string,
): Promise<JudgeResponse> {
  const response = await fetch(
    "https://openrouter.ai/api/v1/chat/completions",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        // Use gpt-4o-mini as a cheap, capable judge model
        model: "openai/gpt-4o-mini",
        stream: false,
        messages: [
          {
            role: "user",
            content: `You are evaluating an AI debugging agent's response quality.

EXPECTED OUTCOME: ${expectedOutcomeDescription}

AGENT'S FINAL RESPONSE: ${finalAssistantResponse}

Did the agent correctly identify the issue described in the expected outcome?
Reply with JSON only (no markdown code fences): { "correct": true/false, "reasoning": "..." }`,
          },
        ],
      }),
    },
  );

  if (!response.ok) {
    throw new Error(`Judge API returned ${response.status}`);
  }

  const body = (await response.json()) as {
    choices: Array<{ message: { content: string } }>;
  };
  const content = body.choices[0]?.message?.content ?? "{}";

  try {
    return JSON.parse(content) as JudgeResponse;
  } catch {
    // If the judge returns malformed JSON, treat as incorrect with the raw text
    return { correct: false, reasoning: content };
  }
}

export async function scoreEvalRun(
  entries: Array<Entry>,
  expectedOutcomeDescription: string,
  apiKey: string,
): Promise<EvalScore> {
  const finalResponse = extractFinalAssistantResponse(entries);
  const totalToolCalls = countToolCalls(entries);
  const totalToolErrors = countToolErrors(entries);
  const hitIterationLimit = checkIterationLimitHit(entries);

  const toolErrorRate =
    totalToolCalls > 0 ? totalToolErrors / totalToolCalls : 0;

  // If there's no final response, the agent failed entirely
  if (finalResponse === "") {
    return {
      correct: false,
      judgeReasoning: "Agent produced no final response",
      iterationDepth: totalToolCalls,
      toolErrorRate,
      hitIterationLimit,
    };
  }

  const judgement = await callOpenRouterForJudgement(
    finalResponse,
    expectedOutcomeDescription,
    apiKey,
  );

  return {
    correct: judgement.correct,
    judgeReasoning: judgement.reasoning,
    iterationDepth: totalToolCalls,
    toolErrorRate,
    hitIterationLimit,
  };
}

// Re-export MAX_TOOL_ITERATIONS for use in runner/index
export { MAX_TOOL_ITERATIONS };
