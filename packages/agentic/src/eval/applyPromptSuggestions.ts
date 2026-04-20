import * as fs from "node:fs";
import * as path from "node:path";
import { spawnSync } from "node:child_process";
import type { PromptSuggestion } from "./promptCritic";

const WORKSPACE_ROOT = path.resolve(__dirname, "..", "..", "..", "..");

export const PROMPT_SUGGESTIONS_JSON_PATH = path.join(
  WORKSPACE_ROOT,
  "tmp",
  "agentic-evals",
  "prompt-suggestions.json",
);

export const PROMPT_SUGGESTIONS_MARKDOWN_PATH = path.join(
  WORKSPACE_ROOT,
  "tmp",
  "agentic-evals",
  "prompt-suggestions.md",
);

const SYSTEM_PROMPT_FILE_PATH = path.join(
  WORKSPACE_ROOT,
  "packages",
  "agentic",
  "src",
  "model",
  "system.ts",
);

const PROMPT_TARGET_FILE_PATHS: Record<string, string> = {
  SHARED_SYSTEM_CARD: SYSTEM_PROMPT_FILE_PATH,
  EXTENSION_SYSTEM_CARD_MESSAGE: SYSTEM_PROMPT_FILE_PATH,
  WORKSPACE_SYSTEM_CARD_MESSAGE: SYSTEM_PROMPT_FILE_PATH,
  SYSTEM_CARD_MESSAGE: SYSTEM_PROMPT_FILE_PATH,
};

export interface AppliedPromptSuggestionsResult {
  updatedSources: Map<string, string>;
  appliedCount: number;
  warnings: Array<string>;
}

export function resolvePromptSuggestionTargetPath(
  target: string,
): string | null {
  return PROMPT_TARGET_FILE_PATHS[target] ?? null;
}

function escapeTemplateLiteralText(text: string): string {
  return text.replace(/`/g, "\\`");
}

export function applyPromptSuggestionToSource(
  source: string,
  suggestion: PromptSuggestion,
): { updatedSource: string; applied: boolean } {
  const directIndex = source.indexOf(suggestion.currentText);
  if (directIndex !== -1) {
    return {
      applied: true,
      updatedSource:
        source.slice(0, directIndex) +
        suggestion.suggestedText +
        source.slice(directIndex + suggestion.currentText.length),
    };
  }

  if (!suggestion.currentText.includes("`")) {
    return { updatedSource: source, applied: false };
  }

  const escapedCurrentText = escapeTemplateLiteralText(suggestion.currentText);
  const escapedIndex = source.indexOf(escapedCurrentText);
  if (escapedIndex === -1) {
    return { updatedSource: source, applied: false };
  }

  return {
    applied: true,
    updatedSource:
      source.slice(0, escapedIndex) +
      escapeTemplateLiteralText(suggestion.suggestedText) +
      source.slice(escapedIndex + escapedCurrentText.length),
  };
}

export function applyPromptSuggestionsToSources(
  sources: Map<string, string>,
  suggestions: Array<PromptSuggestion>,
): AppliedPromptSuggestionsResult {
  const updatedSources = new Map(sources);
  const warnings: Array<string> = [];
  let appliedCount = 0;

  for (const suggestion of suggestions) {
    const filePath = resolvePromptSuggestionTargetPath(suggestion.target);
    if (filePath === null) {
      warnings.push(`Skipping unknown prompt target ${suggestion.target}`);
      continue;
    }

    const currentSource = updatedSources.get(filePath);
    if (currentSource === undefined) {
      warnings.push(
        `Skipping ${suggestion.target} because ${filePath} was not loaded`,
      );
      continue;
    }

    const next = applyPromptSuggestionToSource(currentSource, suggestion);
    if (!next.applied) {
      warnings.push(
        `Skipping ${suggestion.target} because currentText was not found`,
      );
      continue;
    }

    updatedSources.set(filePath, next.updatedSource);
    appliedCount += 1;
  }

  return { updatedSources, appliedCount, warnings };
}

export function loadPromptSuggestions(
  filePath: string,
): Array<PromptSuggestion> | null {
  if (!fs.existsSync(filePath)) {
    return null;
  }

  const raw = fs.readFileSync(filePath, "utf8").trim();
  if (raw.length === 0) {
    return [];
  }

  const parsed = JSON.parse(raw) as unknown;
  if (!Array.isArray(parsed)) {
    return [];
  }

  return parsed as Array<PromptSuggestion>;
}

function writeFileEnsuringDir(filePath: string, contents: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, contents);
}

function runTypecheck(): boolean {
  const result = spawnSync("pnpm", ["--dir", "packages/agentic", "typecheck"], {
    cwd: WORKSPACE_ROOT,
    stdio: "inherit",
  });
  return result.status === 0;
}

export async function main(): Promise<void> {
  const suggestions = loadPromptSuggestions(PROMPT_SUGGESTIONS_JSON_PATH);
  if (suggestions === null) {
    console.log(
      `Prompt suggestions artifact not found at ${path.relative(
        WORKSPACE_ROOT,
        PROMPT_SUGGESTIONS_JSON_PATH,
      )} — nothing to apply.`,
    );
    return;
  }

  if (suggestions.length === 0) {
    console.log("Prompt suggestions artifact is empty — nothing to apply.");
    return;
  }

  const sourcePaths = Array.from(
    new Set(
      suggestions
        .map((suggestion) =>
          resolvePromptSuggestionTargetPath(suggestion.target),
        )
        .filter((filePath): filePath is string => filePath !== null),
    ),
  );

  const originalSources = new Map<string, string>();
  const loadedSources = new Map<string, string>();
  for (const filePath of sourcePaths) {
    if (!fs.existsSync(filePath)) {
      console.warn(`Skipping missing prompt target file ${filePath}`);
      continue;
    }
    const source = fs.readFileSync(filePath, "utf8");
    originalSources.set(filePath, source);
    loadedSources.set(filePath, source);
  }

  const { updatedSources, appliedCount, warnings } =
    applyPromptSuggestionsToSources(loadedSources, suggestions);

  for (const warning of warnings) {
    console.warn(warning);
  }

  if (appliedCount === 0) {
    console.log("Prompt suggestions produced no file changes.");
    return;
  }

  for (const [filePath, source] of updatedSources) {
    const originalSource = originalSources.get(filePath);
    if (originalSource !== undefined && originalSource !== source) {
      writeFileEnsuringDir(filePath, source);
    }
  }

  if (!runTypecheck()) {
    console.error(
      "Typecheck failed after applying prompt suggestions — restoring originals.",
    );
    for (const [filePath, source] of originalSources) {
      writeFileEnsuringDir(filePath, source);
    }
    process.exit(1);
  }

  console.log(`Applied ${appliedCount} prompt suggestion(s).`);
}

const isEntryPoint =
  process.argv[1] !== undefined &&
  (process.argv[1].endsWith("/applyPromptSuggestions.ts") ||
    process.argv[1].endsWith("/applyPromptSuggestions.js"));

if (isEntryPoint) {
  main().catch((error: unknown) => {
    console.error("Failed to apply prompt suggestions:", error);
    process.exit(1);
  });
}
