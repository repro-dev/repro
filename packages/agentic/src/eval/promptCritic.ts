import type { EvalResult } from "./runner";

export interface PromptSuggestion {
  target: string;
  currentText: string;
  suggestedText: string;
  rationale: string;
}

export async function suggestPromptImprovements(
  systemPrompt: string,
  toolDescriptions: Array<{ name: string; description: string }>,
  results: Array<EvalResult>,
  apiKey: string,
): Promise<Array<PromptSuggestion>> {
  // Build a concise per-fixture summary for the critic
  const fixturesSummary = results
    .map((r) => {
      const { brevity, directness, signalNoise } = r.averageQualityScore;
      const composite = ((brevity + directness + signalNoise) / 3).toFixed(1);
      const correctnessPct = (r.correctnessRate * 100).toFixed(1) + "%";
      const errorPct = (r.averageToolErrorRate * 100).toFixed(1) + "%";
      const avgCalls = r.averageIterationDepth.toFixed(1);
      // Include judge reasoning from the first run as a concrete sample
      const sampleReasoning = r.runs[0]?.judgeReasoning ?? "(no reasoning)";
      return [
        `### ${r.fixtureName}`,
        `- Correctness: ${correctnessPct}`,
        `- Avg error rate: ${errorPct}`,
        `- Avg tool calls: ${avgCalls}`,
        `- Composite quality: ${composite}/3`,
        `- Sample judge reasoning: "${sampleReasoning}"`,
      ].join("\n");
    })
    .join("\n\n");

  const toolsSection = toolDescriptions
    .map((t) => `**${t.name}**: ${t.description}`)
    .join("\n\n");

  const userMessage = [
    "## System Prompt",
    "",
    systemPrompt,
    "",
    "## Tool Descriptions",
    "",
    toolsSection,
    "",
    "## Eval Results",
    "",
    fixturesSummary,
    "",
    "## Task",
    "",
    "Produce a JSON array of suggested edits. Each edit must have: target (which file/export), currentText (short excerpt to replace), suggestedText (replacement), rationale.",
  ].join("\n");

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
              "You are a prompt engineer reviewing eval results for an AI debugging agent. Your job is to identify specific, targeted improvements to the system prompt and tool descriptions.",
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
      `Prompt critic API returned ${response.status} — skipping suggestions`,
    );
    return [];
  }

  const body = (await response.json()) as {
    choices: Array<{ message: { content: string } }>;
  };
  const content = body.choices[0]?.message?.content ?? "[]";

  try {
    const parsed: unknown = JSON.parse(content);
    if (!Array.isArray(parsed)) {
      console.warn(
        "Prompt critic returned non-array JSON — skipping suggestions",
      );
      return [];
    }
    return parsed as Array<PromptSuggestion>;
  } catch {
    console.warn(
      "Prompt critic returned malformed JSON — skipping suggestions",
    );
    return [];
  }
}
