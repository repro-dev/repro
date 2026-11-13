#!/usr/bin/env node
// Generates Claude Code subagent definitions (.claude/agents/*.md) from the
// canonical OpenCode agent files in .agents/agents/*.md. The OpenCode format is
// the source of truth because it is the richer of the two.
//
// Usage:
//   tsx scripts/sync-agent-definitions.ts          write .claude/agents/
//   tsx scripts/sync-agent-definitions.ts --check  exit 1 when generated files are stale
//
// Mapping. Anything not listed is dropped, and every dropped key prints a warning:
//   filename          name
//   description       description
//   reasoningEffort   effort (Claude Code accepts the same low|medium|high|xhigh|max levels)
//   tools.<x>: false  disallowedTools (tools.edit also blocks Write, as OpenCode's edit does)
//   permission.<x>: deny  disallowedTools, same tool mapping
//   mode: subagent    nothing, since every Claude Code agent here is a subagent
// Dropped: mode: primary (generated as a subagent), model (per-agent models stay
// in .opencode/profiles), temperature, permission.bash (Claude Code has no per-agent
// bash allowlist in frontmatter), permission.doom_loop, tools.<x>: true.

import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..'
)
const sourceDir = path.join(repoRoot, '.agents/agents')
const targetDir = path.join(repoRoot, '.claude/agents')

const GENERATED_MARKER = 'GENERATED FILE'
const EFFORT_LEVELS = ['low', 'medium', 'high', 'xhigh', 'max']

// OpenCode tool key -> Claude Code tool names it covers.
const CLAUDE_TOOLS_BY_KEY: Record<string, Array<string>> = {
  read: ['Read'],
  write: ['Write'],
  edit: ['Edit', 'Write'],
  glob: ['Glob'],
  grep: ['Grep'],
  bash: ['Bash'],
  webfetch: ['WebFetch'],
  websearch: ['WebSearch'],
  task: ['Agent'],
  skill: ['Skill'],
}

export type Warning = { file: string; message: string }
export type Generated = { content: string; warnings: Array<Warning> }

type Value = string | boolean | number | null | { [key: string]: Value }
type Line = { indent: number; text: string }

// Minimal YAML reader for the agent frontmatter subset: nested maps with
// scalar leaves. Anything else (lists, anchors, block scalars) throws, so a new
// construct fails loudly instead of being mis-read.
export function splitFrontmatter(source: string): {
  yaml: string
  body: string
} {
  const match = /^---\n([\s\S]*?\n)---\n/.exec(source)
  if (!match) throw new Error('missing frontmatter block')
  return { yaml: match[1] ?? '', body: source.slice(match[0].length) }
}

function toLines(yaml: string): Array<Line> {
  return yaml.split('\n').flatMap(raw => {
    if (raw.trim() === '' || raw.trimStart().startsWith('#')) return []
    if (raw.includes('\t'))
      throw new Error(`tab indentation is not supported: ${raw}`)
    const indent = raw.length - raw.trimStart().length
    return [{ indent, text: raw.trim() }]
  })
}

function findKeyColon(text: string): number {
  let start = 0
  if (text.startsWith("'") || text.startsWith('"')) {
    const close = text.indexOf(text[0] as string, 1)
    if (close < 0) throw new Error(`unterminated quoted key: ${text}`)
    start = close + 1
  }
  const colon = text.indexOf(':', start)
  if (colon < 0) throw new Error(`expected "key: value": ${text}`)
  return colon
}

function unquote(raw: string): string {
  if (raw.length >= 2 && (raw.startsWith("'") || raw.startsWith('"'))) {
    return parseScalar(raw) as string
  }
  return raw
}

function parseScalar(raw: string): Value {
  if (raw.length >= 2 && raw.startsWith("'") && raw.endsWith("'")) {
    return raw.slice(1, -1).replace(/''/g, "'")
  }
  if (raw.length >= 2 && raw.startsWith('"') && raw.endsWith('"')) {
    return JSON.parse(raw) as string
  }
  if (raw === 'true') return true
  if (raw === 'false') return false
  if (raw === 'null' || raw === '~') return null
  if (/^-?\d+(\.\d+)?$/.test(raw)) return Number(raw)
  if (/^[[{&*!|>-]/.test(raw))
    throw new Error(`unsupported YAML construct: ${raw}`)
  return raw
}

function parseBlock(
  lines: Array<Line>,
  from: number,
  indent: number
): [Record<string, Value>, number] {
  const out: Record<string, Value> = {}
  let i = from
  while (i < lines.length) {
    const line = lines[i] as Line
    if (line.indent < indent) break
    if (line.indent > indent)
      throw new Error(`unexpected indentation: ${line.text}`)
    const colon = findKeyColon(line.text)
    const key = unquote(line.text.slice(0, colon).trim())
    const rest = line.text.slice(colon + 1).trim()
    const next = lines[i + 1]
    if (rest !== '') {
      out[key] = parseScalar(rest)
      i += 1
    } else if (next !== undefined && next.indent > indent) {
      const [child, end] = parseBlock(lines, i + 1, next.indent)
      out[key] = child
      i = end
    } else {
      out[key] = null
      i += 1
    }
  }
  return [out, i]
}

export function parseYaml(yaml: string): Record<string, Value> {
  const lines = toLines(yaml)
  const [data, end] = parseBlock(lines, 0, 0)
  if (end !== lines.length)
    throw new Error('could not parse frontmatter to the end')
  return data
}

function asMap(value: Value | undefined, where: string): Record<string, Value> {
  if (value === null || value === undefined || typeof value !== 'object') {
    throw new Error(`${where} must be a map`)
  }
  return value
}

export function mapAgent(file: string, source: string): Generated {
  const warnings: Array<Warning> = []
  const warn = (message: string) => warnings.push({ file, message })
  const { yaml, body } = splitFrontmatter(source)
  const data = parseYaml(yaml)
  const name = path.basename(file, '.md')

  const description = data.description
  if (typeof description !== 'string' || description === '') {
    throw new Error(`${file}: description is required`)
  }

  const disallowed = new Set<string>()
  const denyKey = (key: string, where: string) => {
    const tools = CLAUDE_TOOLS_BY_KEY[key]
    if (tools === undefined) {
      warn(`dropped ${where}: no Claude Code tool maps from "${key}"`)
      return
    }
    tools.forEach(tool => disallowed.add(tool))
  }

  let effort: string | undefined
  for (const [key, value] of Object.entries(data)) {
    switch (key) {
      case 'description':
        break
      case 'mode':
        if (value === 'primary') {
          warn(
            'mode: primary has no Claude Code equivalent; generated as a subagent'
          )
        } else if (value !== 'subagent') {
          warn(
            `mode: "${String(
              value
            )}" is not recognised; generated as a subagent`
          )
        }
        break
      case 'reasoningEffort':
        if (typeof value === 'string' && EFFORT_LEVELS.includes(value)) {
          effort = value
        } else {
          warn(
            `dropped reasoningEffort: ${String(
              value
            )} is not a Claude Code effort level`
          )
        }
        break
      case 'tools':
        for (const [tool, allowed] of Object.entries(asMap(value, 'tools'))) {
          if (allowed === false) denyKey(tool, `tools.${tool}`)
          else if (allowed !== true)
            warn(`dropped tools.${tool}: value is not a boolean`)
        }
        break
      case 'permission':
        for (const [tool, rule] of Object.entries(asMap(value, 'permission'))) {
          if (tool === 'bash') {
            warn(
              'dropped permission.bash: Claude Code subagents take no per-command bash allowlist; bash access follows settings'
            )
          } else if (tool === 'doom_loop') {
            warn('dropped permission.doom_loop: no Claude Code equivalent')
          } else if (rule === 'deny') {
            denyKey(tool, `permission.${tool}`)
          } else if (typeof rule === 'object' && rule !== null) {
            // Glob map such as { '*': 'allow' }: only a blanket '*' rule maps.
            const blanket = rule['*']
            if (blanket === 'deny') denyKey(tool, `permission.${tool}`)
            else if (blanket !== 'allow') {
              warn(
                `dropped permission.${tool}: glob map has no blanket "*" rule`
              )
            }
          } else if (rule !== 'allow') {
            warn(
              `dropped permission.${tool}: rule "${String(
                rule
              )}" is not allow or deny`
            )
          }
        }
        break
      case 'model':
        warn(
          'dropped model: per-agent models live in .opencode/profiles and are not copied'
        )
        break
      default:
        warn(`dropped "${key}": no Claude Code equivalent`)
    }
  }

  const frontmatter = [
    '---',
    `# ${GENERATED_MARKER}: do not edit. Source: .agents/agents/${name}.md`,
    '# Regenerate with: pnpm run agents:sync',
    `name: ${name}`,
    `description: ${JSON.stringify(description)}`,
  ]
  if (disallowed.size > 0) {
    frontmatter.push(`disallowedTools: ${[...disallowed].join(', ')}`)
  }
  if (effort !== undefined) frontmatter.push(`effort: ${effort}`)
  frontmatter.push('---')

  return { content: `${frontmatter.join('\n')}\n${body}`, warnings }
}

function listMarkdown(dir: string): Array<string> {
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter(file => file.endsWith('.md'))
    .sort()
}

function main(argv: Array<string>): void {
  const check = argv.includes('--check')
  const expected = new Map<string, string>()
  const warnings: Array<Warning> = []

  for (const file of listMarkdown(sourceDir)) {
    const result = mapAgent(
      file,
      readFileSync(path.join(sourceDir, file), 'utf8')
    )
    expected.set(file, result.content)
    warnings.push(...result.warnings)
  }
  for (const warning of warnings) {
    process.stderr.write(
      `warn: .agents/agents/${warning.file}: ${warning.message}\n`
    )
  }

  const problems: Array<string> = []
  for (const [file, content] of expected) {
    const target = path.join(targetDir, file)
    const current = existsSync(target) ? readFileSync(target, 'utf8') : null
    if (current === content) continue
    if (check) {
      problems.push(
        `stale: .claude/agents/${file} ${
          current === null ? 'is missing' : 'differs from its source'
        }`
      )
    } else {
      mkdirSync(targetDir, { recursive: true })
      writeFileSync(target, content)
      process.stdout.write(`wrote .claude/agents/${file}\n`)
    }
  }

  for (const file of listMarkdown(targetDir)) {
    if (expected.has(file)) continue
    const target = path.join(targetDir, file)
    if (check) {
      problems.push(
        `stale: .claude/agents/${file} has no source in .agents/agents/`
      )
    } else if (readFileSync(target, 'utf8').includes(GENERATED_MARKER)) {
      rmSync(target)
      process.stdout.write(`removed .claude/agents/${file} (source deleted)\n`)
    } else {
      problems.push(
        `.claude/agents/${file} is not generated; move it to .agents/agents/ or delete it`
      )
    }
  }

  if (problems.length > 0) {
    for (const problem of problems) process.stderr.write(`${problem}\n`)
    if (check)
      process.stderr.write(
        'Run `pnpm run agents:sync` and commit the result.\n'
      )
    process.exitCode = 1
    return
  }
  if (check)
    process.stdout.write(`agent definitions in sync (${expected.size} files)\n`)
}

if (
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main(process.argv.slice(2))
}
