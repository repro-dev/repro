import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..'
)

function readText(relativePath: string) {
  return readFileSync(path.join(repoRoot, relativePath), 'utf8')
}

describe('REP-1472 delivery workflow wiring', () => {
  const referencesDir = '.opencode/skills/delivery-workflow/references'

  it('has no fragment files in references/', () => {
    assert.ok(
      !existsSync(path.join(repoRoot, referencesDir)),
      `references/ directory should not exist`
    )
  })

  it('has build.md but not deliver.md or deliver-issue.md', () => {
    assert.ok(
      existsSync(path.join(repoRoot, '.opencode/commands/build.md')),
      'missing build.md'
    )
    assert.ok(
      !existsSync(path.join(repoRoot, '.opencode/commands/deliver.md')),
      'deliver.md should not exist'
    )
    assert.ok(
      !existsSync(path.join(repoRoot, '.opencode/commands/deliver-issue.md')),
      'deliver-issue.md should not exist'
    )
  })

  it('has build.md as a thin shim loading only delivery-workflow skill', () => {
    const build = readText('.opencode/commands/build.md')

    assert.match(build, /Load `delivery-workflow`/)
    assert.doesNotMatch(build, /references\/deliver-/)
    assert.doesNotMatch(build, /\/deliver --issue/)
    assert.doesNotMatch(build, /Fragment overrides/)
  })

  it('has SKILL.md with merged content and no fragment references', () => {
    const skill = readText('.opencode/skills/delivery-workflow/SKILL.md')

    assert.doesNotMatch(skill, /references\/deliver-/)
    assert.doesNotMatch(skill, /Shared `\/deliver` fragments/)
    assert.match(skill, /## Orchestration boundaries/)
    assert.match(skill, /## Verification/)
    assert.match(skill, /## Throughout/)
  })

  it('has no /deliver or /deliver-issue command references in SKILL.md', () => {
    const skill = readText('.opencode/skills/delivery-workflow/SKILL.md')

    assert.doesNotMatch(skill, /\/deliver /)
    assert.doesNotMatch(skill, /\/deliver-issue/)
  })
})

describe('REP-1625 adversarial review wiring', () => {
  it('has the adversarial-review agent file', () => {
    assert.ok(
      existsSync(path.join(repoRoot, '.opencode/agents/adversarial-review.md')),
      'missing .opencode/agents/adversarial-review.md'
    )
  })

  it('wires the adversarial pass into the delivery-workflow SKILL.md', () => {
    const skill = readText('.opencode/skills/delivery-workflow/SKILL.md')

    assert.match(skill, /role: adversarial/)
    assert.match(skill, /adversarial-review/)
  })
})
