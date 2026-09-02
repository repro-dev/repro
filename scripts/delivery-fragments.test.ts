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

describe('REP-1646 UI audit gate wiring', () => {
  it('adds the audit gate phase to delivery-workflow with renumbered sections', () => {
    const skill = readText('.opencode/skills/delivery-workflow/SKILL.md')

    assert.match(skill, /## 5\. Audit gate/)
    assert.match(skill, /ui:classify/)
    assert.match(skill, /proof-bundle assertion/i)
    // Sections renumbered after the gate insertion (previously 5/6/7).
    assert.match(skill, /## 6\. Review loop/)
    assert.match(skill, /## 7\. Publish/)
    assert.match(
      skill,
      /## 8\. Manual verification output \(publish completion gate\)/
    )
  })

  it('adds the five-pillar audit sections to ui-verification', () => {
    const skill = readText('.opencode/skills/ui-verification/SKILL.md')

    assert.match(skill, /Five-pillar audit rubric/i)
    assert.match(skill, /Severity calibration/i)
    assert.match(skill, /Capture manifest/i)
    assert.match(skill, /Browser input canary/i)
    assert.match(skill, /Known-artifact ignore list/i)
  })

  it('makes the audit artifact a blocking prerequisite in review-standards', () => {
    const skill = readText('.opencode/skills/review-standards/SKILL.md')

    assert.doesNotMatch(skill, /ordinary requirement gaps/)
    assert.match(skill, /does not start without the audit artifact/)
    assert.match(
      skill,
      /Missing audit artifact on a UI-touching PR \(REP-1646\)/
    )
  })

  it('updates the external delivery-workflow section references', () => {
    const gitWorkflow = readText('.opencode/skills/git-workflow/SKILL.md')
    assert.match(gitWorkflow, /delivery-workflow §7\/§8/)
    assert.match(gitWorkflow, /delivery-workflow §7 step 4\/5/)
    assert.match(
      readText('.opencode/skills/pen-reconcile/SKILL.md'),
      /delivery-workflow §8/
    )
  })

  it('wires the classifier script and its tests into package.json', () => {
    const pkg = JSON.parse(readText('package.json')) as {
      scripts: Record<string, string>
    }
    assert.equal(pkg.scripts['ui:classify'], 'tsx scripts/classify-ui-diff.ts')
    assert.match(
      readText('package.json'),
      /scripts\/classify-ui-diff\.test\.ts/
    )
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

    // Every-issue spawn rule: the adversarial pass is spawned for every issue,
    // regardless of risk level.
    assert.match(skill, /Every issue[^\n]*adversarial pass/)

    // Fix-loop generalization: the bounded review loop applies to every review
    // pass (standard and adversarial).
    assert.match(skill, /all review passes|either review pass/)
  })
})
