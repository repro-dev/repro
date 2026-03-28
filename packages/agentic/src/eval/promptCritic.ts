import type { CritiqueItem } from "./introspector";

export interface PromptSuggestion {
  target: string;
  currentText: string;
  suggestedText: string;
  rationale: string;
}

export async function suggestPromptImprovements(
  systemPrompt: string,
  toolDescriptions: Array<{ name: string; description: string }>,
  // Critique findings keyed by fixture name, then run index
  critiquesByFixture: Array<{
    fixtureName: string;
    runs: Array<{
      runIndex: number;
      correct: boolean;
      critiques: Array<CritiqueItem>;
    }>;
  }>,
  apiKey: string,
  promptExportName: string,
): Promise<Array<PromptSuggestion>> {
  // Build a structured critique summary per fixture and run for the critic
  const critiqueSection = critiquesByFixture
    .map(({ fixtureName, runs }) => {
      const runLines = runs.map(({ runIndex, correct, critiques }) => {
        const label = `Run ${runIndex + 1} (${
          correct ? "correct" : "incorrect"
        })`;
        if (critiques.length === 0) {
          return `${label}: no critiques`;
        }
        const items = critiques.map((c) =>
          [
            `- Issue: ${c.issue}`,
            `  Likely cause: ${c.likelyPromptCause}`,
            `  Suggestion: ${c.suggestion}`,
          ].join("\n"),
        );
        return `${label}:\n${items.join("\n")}`;
      });
      return [`### ${fixtureName}`, ...runLines].join("\n");
    })
    .join("\n\n");

  const toolsSection = toolDescriptions
    .map((t) => `**${t.name}**: ${t.description}`)
    .join("\n\n");

  const userMessage = [
    "## System Prompt",
    "",
    "```",
    systemPrompt,
    "```",
    "",
    "## Tool Descriptions",
    "",
    "```",
    toolsSection,
    "```",
    "",
    "## Critique Findings",
    "",
    critiqueSection,
    "",
    "## Task",
    "",
    "Based on the critique findings above, produce a JSON array of ready-to-apply text edits to the system prompt and tool descriptions.",
    "",
    "Rules:",
    '- Each edit must have: target (must be "' +
      promptExportName +
      '"), currentText (the verbatim substring to replace), suggestedText (the replacement text), rationale.',
    "- currentText MUST be copied verbatim from the fenced text above — do not paraphrase or reconstruct from memory. An automated agent will apply these edits as literal find-and-replace operations; if currentText does not match exactly, the edit will fail.",
    "- Preserve all formatting characters exactly as they appear in the fenced block: **bold markers**, `backticks`, and any other punctuation are part of the text and must be included.",
    "- Keep currentText as short as possible while still uniquely identifying the location.",
    "- If you cannot find a verbatim anchor for a suggestion, omit it rather than fabricating one.",
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
              "You are a prompt engineer reviewing per-run critique findings for an AI debugging agent. Your job is to synthesise the critiques into specific, targeted improvements to the system prompt and tool descriptions. You will output JSON edits that will be applied mechanically by an automated agent — every currentText field must be a verbatim substring of the prompt text provided in the user message. Never invent or paraphrase currentText.",
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
  const raw = body.choices[0]?.message?.content ?? "[]";
  // Strip markdown code fences that some models wrap around JSON responses
  const content = raw
    .replace(/^```(?:json)?\n?/, "")
    .replace(/\n?```$/, "")
    .trim();

  try {
    const parsed: unknown = JSON.parse(content);
    if (!Array.isArray(parsed)) {
      console.warn(
        "Prompt critic returned non-array JSON — skipping suggestions",
      );
      return [];
    }
    // Enforce promptExportName as the target on every suggestion, overriding any
    // hallucinated value the model may have returned.
    return (parsed as Array<PromptSuggestion>).map((s) => ({
      ...s,
      target: promptExportName,
    }));
  } catch {
    console.warn(
      "Prompt critic returned malformed JSON — skipping suggestions",
    );
    return [];
  }
}
