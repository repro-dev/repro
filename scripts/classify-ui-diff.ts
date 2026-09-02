#!/usr/bin/env node
// REP-1646: mechanical UI-diff classifier for the five-pillar visual audit gate.
//
// Classifies a diff's changed files as UI-touching or not. The delivery-workflow
// §5 audit gate consumes the JSON verdict: UI-touching deliveries must produce
// browser screenshot evidence plus a five-pillar audit (ui-verification skill)
// before review starts; non-UI deliveries skip the gate mechanically. The
// verdict is data, not an error — exit 0 on any successful classification.
//
// Determinism: same path list -> same verdict. No clock reads, no filesystem
// writes; git mode only shells out to `git diff -z --name-only --no-renames`.
//
// Flags:
//   --base <ref>         diff base ref (required in git mode)
//   --head <ref>         diff head ref (default HEAD)
//   --paths-from-stdin   read newline-separated paths from stdin instead of
//                        running git
//   --help, -h           show usage
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export type UiRule = {
  name: string
  matches: (path: string) => boolean
}

export type MatchedPath = {
  path: string
  rule: string
}

export type ClassifyVerdict = {
  uiTouching: boolean
  matched: MatchedPath[]
}

/**
 * Test files are pre-filtered before the positive rules so that adding tests
 * for UI components never triggers the audit gate. `*.test.ts` / `*.spec.ts`
 * are excluded alongside the tsx forms because the design-package rule
 * matches any file under packages/design.
 */
export function isTestFile(path: string): boolean {
  return (
    path.includes('__tests__/') ||
    /\.test\.[cm]?[jt]sx?$/.test(path) ||
    /\.spec\.[cm]?[jt]sx?$/.test(path)
  )
}

/**
 * Ordered rule table: first matching rule wins (attribution), any match flips
 * the verdict (any-match semantics). Order matters for attribution only — the
 * verdict is rule-order independent.
 */
export const UI_RULES: ReadonlyArray<UiRule> = [
  {
    name: 'app-ui',
    matches: path => /^apps\/[^/]+\/src\/.+\.tsx$/.test(path),
  },
  {
    name: 'package-ui',
    matches: path => /^packages\/[^/]+\/src\/.+\.tsx$/.test(path),
  },
  {
    // Any file under packages/design counts — tokens, barrels, styles.
    name: 'design-package',
    matches: path => path.startsWith('packages/design/'),
  },
  {
    // Honors the issue's literal *.stories.* — any .stories. file (tsx, and
    // mdx docs entries) is a Storybook surface; no extension enumeration.
    name: 'storybook',
    matches: path => path.includes('.stories.'),
  },
  {
    name: 'pen-design',
    matches: path => path.endsWith('.pen'),
  },
  {
    // Conservative extension beyond the issue's literal list: styles under
    // app/package src/ are user-visible surfaces too (documented in the plan).
    name: 'styles',
    matches: path =>
      /^apps\/[^/]+\/src\/.+\.(?:css|scss)$/.test(path) ||
      /^packages\/[^/]+\/src\/.+\.(?:css|scss)$/.test(path),
  },
  {
    // Browser-loaded HTML host documents: src-anchored pages (extension
    // bridgeHost/devtools) plus app-root hosts (index.html, apiBridge.html).
    name: 'html-surface',
    matches: path =>
      /^apps\/[^/]+\/src\/.+\.html$/.test(path) ||
      /^apps\/[^/]+\/[^/]+\.html$/.test(path),
  },
]

/**
 * Classify changed paths. Duplicates collapse; input order is preserved;
 * each matched path records the first rule that matched.
 */
export function classifyPaths(paths: readonly string[]): ClassifyVerdict {
  const seen = new Set<string>()
  const matched: MatchedPath[] = []
  for (const path of paths) {
    if (seen.has(path) || isTestFile(path)) continue
    seen.add(path)
    const rule = UI_RULES.find(({ matches }) => matches(path))
    if (rule) {
      matched.push({ path, rule: rule.name })
    }
  }
  return { uiTouching: matched.length > 0, matched }
}

export type ClassifyOptions = {
  base?: string
  head?: string
  pathsFromStdin?: boolean
  help?: boolean
}

export type CliParseResult = {
  options: ClassifyOptions
  error?: string
}

const FLAG_VALUE_DESCRIPTIONS: Record<string, string> = {
  '--base': 'a git ref',
  '--head': 'a git ref',
}

/**
 * Parse CLI args into ClassifyOptions; returns an error for malformed usage.
 * Args are scanned left-to-right so a flag always consumes the immediately
 * following token as its value; a flag name used as a value or a missing
 * value is rejected (mirrors pen-contract.ts parseCliArgs).
 */
export function parseCliArgs(args: string[]): CliParseResult {
  const options: ClassifyOptions = {}
  const assigners: Record<string, (value: string) => void> = {
    '--base': value => {
      options.base = value
    },
    '--head': value => {
      options.head = value
    },
  }

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!
    const assign = assigners[arg]
    if (assign) {
      const value = args[i + 1]
      if (value === undefined) {
        return {
          options,
          error: `${arg} requires a value (${
            FLAG_VALUE_DESCRIPTIONS[arg] ?? 'a value'
          })`,
        }
      }
      if (value.startsWith('--')) {
        return {
          options,
          error: `${arg} value "${value}" looks like another flag; expected ${
            FLAG_VALUE_DESCRIPTIONS[arg] ?? 'a value'
          }`,
        }
      }
      assign(value)
      i++
      continue
    }
    if (arg === '--paths-from-stdin') {
      options.pathsFromStdin = true
      continue
    }
    if (arg === '--help' || arg === '-h') {
      options.help = true
      continue
    }
    return { options, error: `unknown argument "${arg}"` }
  }
  return { options }
}

export type ClassifyIo = {
  stdin?: string
  readStdin?: () => string
  jsonOut?: (json: string) => void
  errorOut?: (message: string) => void
  execGit?: (args: string[]) => string
}

export type RunResult = { code: number }

function defaultExecGit(args: string[]): string {
  return execFileSync('git', args, {
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  })
}

// Blocking read of fd 0 — used by the direct-run path in stdin mode. Tests
// inject io.stdin instead so the suite never waits on a real stdin.
function readStdinSync(): string {
  return readFileSync(0, 'utf8')
}

/**
 * Run one classification and emit the JSON verdict. Default mode shells out to
 * `git diff -z --name-only --no-renames <base>...<head>` (--no-renames so
 * renames surface as delete+add — both paths are checked, conservative; -z
 * emits paths verbatim, NUL-delimited — no C-quoting, no newline splitting).
 * stdin mode classifies newline-separated paths instead — git never runs, so
 * base/head are reported as null. Exit 0 on any successful classification
 * (the verdict is data), 1 on usage/execution error.
 */
export function runClassify(
  options: ClassifyOptions,
  io: ClassifyIo = {}
): RunResult {
  const jsonOut = io.jsonOut ?? ((json: string) => console.log(json))
  const errorOut = io.errorOut ?? ((message: string) => console.error(message))
  const execGit = io.execGit ?? defaultExecGit
  const readStdin = io.readStdin ?? readStdinSync

  let rawPaths: string[]
  // stdin mode never runs git, so no base/head is observed — never echo
  // --base/--head flags the verdict did not use.
  let base: string | null = options.pathsFromStdin ? null : options.base ?? null
  let head: string | null = options.pathsFromStdin ? null : options.head ?? null

  try {
    if (options.pathsFromStdin) {
      rawPaths = (io.stdin ?? readStdin())
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0)
    } else {
      if (!options.base) {
        errorOut(
          'ERROR: git mode requires --base <ref> (or use --paths-from-stdin)'
        )
        return { code: 1 }
      }
      head = options.head ?? 'HEAD'
      rawPaths = execGit([
        'diff',
        // -z: NUL-delimited output emitted verbatim — no C-quoting of
        // non-ASCII paths (a quoted "caf\303\251.tsx" matches no rule regex,
        // flipping real UI files to a false non-UI verdict) and no newline
        // splitting, so filenames with spaces or newlines survive.
        '-z',
        '--name-only',
        '--no-renames',
        `${options.base}...${head}`,
      ])
        .split('\0')
        // No trim: filenames may contain leading/trailing spaces verbatim.
        .filter(entry => entry.length > 0)
    }
  } catch (error) {
    errorOut(
      options.pathsFromStdin
        ? `ERROR: reading paths from stdin failed: ${(error as Error).message}`
        : `ERROR: git diff failed: ${(error as Error).message}`
    )
    return { code: 1 }
  }

  const paths = [...new Set(rawPaths)]
  const verdict = classifyPaths(paths)
  jsonOut(
    JSON.stringify({
      mode: 'classify',
      uiTouching: verdict.uiTouching,
      matched: verdict.matched,
      totalChangedFiles: paths.length,
      base,
      head,
    })
  )
  return { code: 0 }
}

function printUsage(): void {
  console.error(`classify-ui-diff — mechanical UI-diff classifier (REP-1646)

Classifies a diff's changed files as UI-touching or not. The delivery-workflow
§5 audit gate consumes the JSON verdict: UI-touching deliveries must produce a
five-pillar visual audit (ui-verification skill) before review starts; non-UI
deliveries skip the gate mechanically. The verdict is data, not an error.

Usage:
  pnpm run ui:classify --base origin/main
                                  Classify the committed diff between HEAD and
                                  origin/main. This is the delivery-workflow §5
                                  invocation.
  tsx scripts/classify-ui-diff.ts --base <ref> --head <ref>
                                  Classify <ref>...<head> (head defaults to
                                  HEAD). Renames surface as delete+add
                                  (--no-renames) so both paths are checked.
  tsx scripts/classify-ui-diff.ts --paths-from-stdin < paths.txt
                                  Classify newline-separated paths from stdin
                                  instead of running git.
  tsx scripts/classify-ui-diff.ts --help (-h)
                                  Show this help.

Exit codes:
  0  classified successfully (uiTouching in the verdict is data, not an error)
  1  usage or execution error (bad flags, git failure)

JSON verdict:
  { "mode": "classify", "uiTouching", "matched": [ { "path", "rule" } ],
    "totalChangedFiles", "base", "head" }`)
}

const isDirectRun =
  process.argv[1] !== undefined &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)

if (isDirectRun) {
  const { options, error } = parseCliArgs(process.argv.slice(2))
  if (error) {
    console.error(`ERROR: ${error}`)
    printUsage()
    process.exit(1)
  }
  if (options.help) {
    printUsage()
    process.exit(0)
  }
  process.exitCode = runClassify(options).code
}
