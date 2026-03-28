import type { AssistantMessage } from "../types";
import type { Entry } from "../types";
import type { EvalScore } from "./scorer";

export interface CritiqueItem {
  issue: string;
  likelyPromptCause: string;
  suggestion: string;
}

// Format a transcript entry compactly for inclusion in the critique prompt.
// Content is truncated to 500 chars to keep the prompt size manageable.
function formatEntry(entry: Entry): string {
  const maxLen = 500;
  let content =
    typeof entry.content === "string"
      ? entry.content
      : JSON.stringify(entry.content);

  if (entry.role === "assistant") {
    const asst = entry as AssistantMessage;
    if (asst.toolCalls.length > 0) {
      const names = asst.toolCalls.map((tc) => tc.function.name).join(", ");
      content = `${content} (tool calls: ${names})`;
    }
  }

  if (content.length > maxLen) {
    content = content.slice(0, maxLen) + "...";
  }

  if (entry.role === "tool") {
    // Include the tool call id to provide context
    const toolEntry = entry as Extract<Entry, { role: "tool" }>;
    return `[tool:${toolEntry.tool_call_id}] ${content}`;
  }

  return `[${entry.role}] ${content}`;
}

export async function critiqueRun(
  transcript: Array<Entry>,
  systemPrompt: string,
  toolDescriptions: Array<{ name: string; description: string }>,
  score: EvalScore,
  expectedOutcomeDescription: string,
  apiKey: string,
): Promise<Array<CritiqueItem>> {
  const transcriptText = transcript.map(formatEntry).join("\n");

  const toolDescText = toolDescriptions
    .map((t) => `- **${t.name}**: ${t.description}`)
    .join("\n");

  const userMessage = `## System Prompt
${systemPrompt}

## Tool Descriptions
${toolDescText}

## Expected Outcome
${expectedOutcomeDescription}

## Run Scores
- correct: ${score.correct}
- judgeReasoning: ${score.judgeReasoning}
- iterationDepth: ${score.iterationDepth}
- toolErrorRate: ${score.toolErrorRate}
- qualityScore: brevity=${score.qualityScore.brevity}, directness=${score.qualityScore.directness}, signalNoise=${score.qualityScore.signalNoise}

## Transcript
${transcriptText}

## Task
Produce a JSON array of critique items, each with: issue (what diverged), likelyPromptCause (which section/line of the prompt or tool description), suggestion (concrete fix). Only include items with clear prompt-level causes. Return [] if the run was correct and high quality.`;

  const response = await fetch(
    "https://openrouter.ai/api/v1/chat/completions",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "openai/gpt-4o",
        stream: false,
        messages: [
          {
            role: "system",
            content:
              "You are a prompt engineer reviewing a single eval run of an AI debugging agent. Your job is to identify specific, actionable critiques linking observed behaviour to probable prompt causes.",
          },
          {
            role: "user",
            content: userMessage,
          },
        ],
      }),
    },
  );

  if (!response.ok) {
    console.warn(
      `Critique API returned ${response.status} — skipping critique`,
    );
    return [];
  }

  const body = (await response.json()) as {
    choices: Array<{ message: { content: string } }>;
  };
  const raw = body.choices[0]?.message?.content ?? "[]";
  // Strip markdown code fences that some models wrap around JSON responses
  const content = raw
    .replace(/^```(?:json)?\n?/, "")
    .replace(/\n?```$/, "")
    .trim();

  try {
    const parsed = JSON.parse(content) as unknown;
    if (!Array.isArray(parsed)) {
      console.warn("Critique API returned non-array — skipping critique");
      return [];
    }
    return parsed as Array<CritiqueItem>;
  } catch {
    console.warn("Critique API returned malformed JSON — skipping critique");
    return [];
  }
}
