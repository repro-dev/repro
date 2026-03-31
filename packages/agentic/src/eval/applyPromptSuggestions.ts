/**
 * CLI script to apply prompt suggestions produced by the eval --analyse pipeline.
 *
 * Reads tmp/agentic-prompt-suggestions.json, locates each suggestion's
 * currentText in the mapped source file, applies the replacement, then
 * runs tsc to validate the result. If typecheck fails, all changes are reverted.
 *
 * Run via:
 *   moon run repro/agentic:apply-prompt-suggestions
 *   # or directly:
 *   tsx packages/agentic/src/eval/applyPromptSuggestions.ts
 */

import * as fs from "fs";
import * as path from "path";
import { spawnSync } from "child_process";
import type { PromptSuggestion } from "./promptCritic";

// Walk up 4 levels from packages/agentic/src/eval to the workspace root
const workspaceRoot = path.resolve(__dirname, "..", "..", "..", "..");
const SUGGESTIONS_JSON_PATH = path.join(
  workspaceRoot,
  "tmp",
  "agentic-prompt-suggestions.json",
);

// Hardcoded map of prompt export names → source file paths (relative to
// workspace root). We never trust suggestion.target as a direct file path.
export const EXPORT_TO_FILE: Record<string, string> = {
  EXTENSION_SYSTEM_CARD_MESSAGE: "packages/agentic/src/model/system.ts",
  WORKSPACE_SYSTEM_CARD_MESSAGE: "packages/agentic/src/model/system.ts",
};

/**
 * Pure logic: applies suggestions to an in-memory map of file contents.
 *
 * Returns a new Map containing only the files that were actually modified,
 * with their updated content. Files that had no applicable suggestions are
 * not included in the result.
 *
 * This function is exported for unit testing — it performs no filesystem I/O.
 */
export function applyPromptSuggestionsFromData(
  suggestions: Array<PromptSuggestion>,
  fileContents: Map<string, string>,
): Map<string, string> {
  // Working copy so we can accumulate multiple replacements per file
  const working = new Map(fileContents);
  const modified = new Set<string>();

  for (const suggestion of suggestions) {
    const relFilePath = EXPORT_TO_FILE[suggestion.target];
    if (relFilePath === undefined) {
      console.warn(
        `applyPromptSuggestions: unknown target "${suggestion.target}" — skipping`,
      );
      continue;
    }

    const content = working.get(relFilePath);
    if (content === undefined) {
      console.warn(
        `applyPromptSuggestions: file "${relFilePath}" not in fileContents map — skipping`,
      );
      continue;
    }

    // First try verbatim match; if that fails, normalise escaped backticks in
    // the file content (source uses \` inside template literals, but the critic
    // quotes the evaluated string with plain `) and try again.
    let searchContent = content;
    if (!content.includes(suggestion.currentText)) {
      const normalised = content.replace(/\\`/g, "`");
      if (!normalised.includes(suggestion.currentText)) {
        console.warn(
          `applyPromptSuggestions: currentText not found in "${relFilePath}" (even after backtick normalisation) — skipping`,
        );
        continue;
      }
      searchContent = normalised;
    }

    // Replace the first occurrence only (String.prototype.replace with a
    // string pattern stops after the first match). When we searched against
    // normalised content the escaped backticks are already gone from
    // searchContent; the suggestedText is written as-is per the spec.
    const updated = searchContent.replace(
      suggestion.currentText,
      suggestion.suggestedText,
    );

    working.set(relFilePath, updated);
    modified.add(relFilePath);
  }

  // Return only the files that changed
  const result = new Map<string, string>();
  for (const filePath of modified) {
    result.set(filePath, working.get(filePath)!);
  }
  return result;
}

async function main(): Promise<void> {
  // Read suggestions JSON
  if (!fs.existsSync(SUGGESTIONS_JSON_PATH)) {
    console.log("No suggestions to apply.");
    process.exit(0);
  }

  const raw = fs.readFileSync(SUGGESTIONS_JSON_PATH, "utf8");
  let suggestions: Array<PromptSuggestion>;
  try {
    suggestions = JSON.parse(raw) as Array<PromptSuggestion>;
  } catch {
    console.warn("applyPromptSuggestions: could not parse suggestions JSON");
    process.exit(1);
  }

  if (suggestions.length === 0) {
    console.log("No suggestions to apply.");
    process.exit(0);
  }

  // Load only the files we need (union of all mapped targets)
  const filesToLoad = new Set<string>();
  for (const s of suggestions) {
    const rel = EXPORT_TO_FILE[s.target];
    if (rel !== undefined) {
      filesToLoad.add(rel);
    }
  }

  const fileContents = new Map<string, string>();
  for (const rel of filesToLoad) {
    const abs = path.join(workspaceRoot, rel);
    if (!fs.existsSync(abs)) {
      console.warn(`applyPromptSuggestions: source file not found: ${abs}`);
      continue;
    }
    fileContents.set(rel, fs.readFileSync(abs, "utf8"));
  }

  // Apply suggestions (pure logic)
  const modified = applyPromptSuggestionsFromData(suggestions, fileContents);

  if (modified.size === 0) {
    console.log(
      `applyPromptSuggestions: 0/${suggestions.length} suggestions applied (none matched). No changes made.`,
    );
    process.exit(0);
  }

  // Preserve originals for potential revert
  const originals = new Map<string, string>();
  for (const [rel] of modified) {
    originals.set(rel, fileContents.get(rel)!);
  }

  // Write modified files to disk
  for (const [rel, content] of modified) {
    fs.writeFileSync(path.join(workspaceRoot, rel), content, "utf8");
  }

  // Run typecheck
  const result = spawnSync(
    "pnpm",
    ["exec", "tsc", "--noEmit", "-p", "packages/agentic/tsconfig.json"],
    { stdio: "inherit", cwd: workspaceRoot },
  );

  if (result.status !== 0) {
    console.error(
      "applyPromptSuggestions: typecheck failed — reverting all changes",
    );
    for (const [rel, original] of originals) {
      fs.writeFileSync(path.join(workspaceRoot, rel), original, "utf8");
    }
    process.exit(1);
  }

  const skipped = suggestions.length - modified.size;
  console.log(
    `applyPromptSuggestions: ${modified.size}/${suggestions.length} suggestion(s) applied` +
      (skipped > 0 ? `, ${skipped} skipped` : "") +
      ".",
  );
  process.exit(0);
}

// Only run main() when this file is the direct entry point, not when imported
// by test files.
const isEntryPoint =
  process.argv[1] !== undefined &&
  (process.argv[1].endsWith("/applyPromptSuggestions.ts") ||
    process.argv[1].endsWith("/applyPromptSuggestions.js"));

if (isEntryPoint) {
  main().catch((err: unknown) => {
    console.error("applyPromptSuggestions failed:", err);
    process.exit(1);
  });
}
