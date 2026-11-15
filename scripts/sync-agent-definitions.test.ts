import assert from 'node:assert/strict'
import {
  existsSync,
  lstatSync,
  readFileSync,
  readdirSync,
  readlinkSync,
} from 'node:fs'
import path from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'
import {
  mapAgent,
  parseYaml,
  splitFrontmatter,
} from './sync-agent-definitions.ts'

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..'
)

const sample = `---
description: Sample agent for tests.
mode: subagent
reasoningEffort: high
temperature: 0.0
tools:
  write: false
  edit: false
permission:
  bash:
    "*": "deny"
    'git log*': 'allow'
  read:
    "*": "allow"
  webfetch: "deny"
---
Body line one.
`

describe('sync-agent-definitions', () => {
  it('parses the frontmatter subset used by OpenCode agent files', () => {
    const { yaml, body } = splitFrontmatter(sample)
    assert.equal(body, 'Body line one.\n')
    assert.deepEqual(parseYaml(yaml), {
      description: 'Sample agent for tests.',
      mode: 'subagent',
      reasoningEffort: 'high',
      temperature: 0,
      tools: { write: false, edit: false },
      permission: {
        bash: { '*': 'deny', 'git log*': 'allow' },
        read: { '*': 'allow' },
        webfetch: 'deny',
      },
    })
  })

  it('maps boolean tool denials and deny rules to disallowedTools', () => {
    const { content } = mapAgent('sample.md', sample)
    assert.match(content, /^---\n# GENERATED FILE: do not edit\./)
    assert.match(content, /\nname: sample\n/)
    assert.match(content, /\ndescription: "Sample agent for tests\."\n/)
    assert.match(content, /\ndisallowedTools: Write, Edit, WebFetch\n/)
    assert.match(content, /\neffort: high\n/)
    assert.ok(content.endsWith('---\nBody line one.\n'))
    assert.ok(!/reasoningEffort|temperature|mode:/.test(content))
  })

  it('warns for every key it cannot map', () => {
    const { warnings } = mapAgent('sample.md', sample)
    const messages = warnings.map(w => w.message).join('\n')
    assert.match(messages, /dropped permission\.bash/)
    assert.match(messages, /dropped "temperature"/)
    assert.equal(
      warnings.some(w => w.message.includes('read')),
      false,
      'a blanket allow on a tool is not a warning'
    )
  })

  it('rejects an agent file without a description', () => {
    assert.throws(
      () => mapAgent('bare.md', '---\nmode: subagent\n---\nBody\n'),
      /description is required/
    )
  })

  it('keeps the committed .claude/agents files in step with their sources', () => {
    const sources = readdirSync(path.join(repoRoot, '.agents/agents')).filter(
      file => file.endsWith('.md')
    )
    for (const file of sources) {
      const source = readFileSync(
        path.join(repoRoot, '.agents/agents', file),
        'utf8'
      )
      const generated = readFileSync(
        path.join(repoRoot, '.claude/agents', file),
        'utf8'
      )
      assert.equal(generated, mapAgent(file, source).content, file)
    }
  })

  it('wires the OpenCode and Claude Code folders to the canonical .agents tree', () => {
    const links: Array<[string, string]> = [
      ['.opencode/skills', '../.agents/skills'],
      ['.opencode/commands', '../.agents/commands'],
      ['.opencode/agents', '../.agents/agents'],
      ['.claude/skills', '../.agents/skills'],
      ['.claude/commands', '../.agents/commands'],
    ]
    for (const [link, target] of links) {
      const abs = path.join(repoRoot, link)
      assert.ok(lstatSync(abs).isSymbolicLink(), `${link} is a symlink`)
      assert.equal(readlinkSync(abs), target, link)
      assert.ok(existsSync(abs), `${link} resolves`)
    }
    assert.equal(readlinkSync(path.join(repoRoot, 'CLAUDE.md')), 'AGENTS.md')
  })
})
