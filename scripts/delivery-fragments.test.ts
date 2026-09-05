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

    // Invariant, not wording: the missing-audit-artifact clause must carry
    // the Blocker declaration (S5 — a phrase-absence guard is evadable by
    // rewording; this pins the requirement itself).
    assert.match(skill, /is a \*\*Blocker\*\*, not an ordinary requirement gap/)
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

  it('keeps the gate fail-closed (preamble and clean-tree checkpoint)', () => {
    const skill = readText('.opencode/skills/delivery-workflow/SKILL.md')

    // §5 fail-closed preamble — the gate is never silently skipped.
    assert.match(skill, /Fail-closed preamble/)
    assert.match(skill, /The gate is never silently skipped/)
    // Step 1 checkpoint commit — classification runs only on a clean tree
    // (uncommitted UI files would classify as a false non-UI).
    assert.match(skill, /never classify on a dirty tree/)
  })

  it('requires the tightened proof-bundle assertions in the gate', () => {
    const skill = readText('.opencode/skills/delivery-workflow/SKILL.md')

    // manifest.json must parse AND contain at least one surface with one state.
    assert.match(skill, /≥1 surface with ≥1 state/)
    // Every state screenshot must be non-empty and resolve on disk.
    assert.match(skill, /NON-EMPTY `screenshot` path/)
    // audit.md must carry the findings-table header or the exact no-findings row.
    assert.match(
      skill,
      /pillar \| severity \| evidence screenshot \| description \| disposition/
    )
    assert.match(skill, /\| none \| none \| none \| no findings \| none \|/)
  })

  it('documents both real exit-1 modes of the proof-bundle assertion', () => {
    const skill = readText('.opencode/skills/delivery-workflow/SKILL.md')

    // (a) gate violation: JSON on stdout — after the pnpm run banner lines.
    assert.match(skill, /parse from the first `\{` line/)
    // (b) execution error: stderr ERROR line and no JSON verdict.
    assert.match(skill, /stderr `ERROR:` line and NO JSON/)
  })

  it('rejects a header-only audit.md and reserves `none` for the sentinel row', () => {
    const skill = readText('.opencode/skills/delivery-workflow/SKILL.md')

    // A header with no rows is vacuous — the audit must carry ≥1
    // dispositioned finding row or the exact no-findings row.
    assert.match(skill, /≥1 finding row each carrying a valid disposition/)
    // `none` is not a finding-row disposition — it is reserved for the
    // no-findings sentinel row only (a `none` finding is neither fixed nor
    // filed and would let review start without resolution).
    assert.match(skill, /`none` is reserved for the no-findings sentinel row/)
    assert.doesNotMatch(
      skill,
      /disposition \(`fixed <commit>` \| `filed REP-xxx` \| `none`\)/
    )
    const uiSkill = readText('.opencode/skills/ui-verification/SKILL.md')
    assert.match(uiSkill, /never for a finding row/)
  })

  it('requires re-classification after post-gate UI drift opportunities', () => {
    const skill = readText('.opencode/skills/delivery-workflow/SKILL.md')

    // The gate classifies once (§5 Step 2). Every later commit path —
    // review-fix loop, non-blocker sweep, publish — must re-run the
    // classifier and re-run §5 Steps 3–5 when the verdict flips.
    assert.match(skill, /after every review-fix-loop commit/)
    assert.match(skill, /after the non-blocker sweep/)
    assert.match(
      skill,
      /review may not complete until the audit gate has passed/
    )
    assert.match(
      skill,
      /publish may not proceed until the audit gate has passed/
    )
    const classifyRuns =
      skill.match(/pnpm run ui:classify --base origin\/main/g) ?? []
    assert.ok(
      classifyRuns.length >= 4,
      `expected ≥4 classifier invocations (gate, fix loop, sweep, publish), found ${classifyRuns.length}`
    )
    // S4: already-UI deliveries re-audit too — a flip is not the only
    // trigger; an intersection with the audited surfaces is.
    const alreadyUi =
      skill.match(
        /and the new `matched` set intersects the audited surfaces/g
      ) ?? []
    assert.ok(
      alreadyUi.length >= 3,
      `expected the already-UI clause in all 3 re-classification bullets, found ${alreadyUi.length}`
    )
  })

  it('pins the capture-side manifest inputs (base and surface naming)', () => {
    const skill = readText('.opencode/skills/delivery-workflow/SKILL.md')

    // S1: the audit prompt tells the auditor what to record in manifest.base
    // — otherwise it records its branch name or HEAD and the freshness
    // assertion fails closed.
    assert.match(skill, /Record `base` exactly as `origin\/main`/)
    // S2: surface names echo the prompt slot verbatim so the coverage
    // assertion cannot fail on a label mismatch.
    assert.match(
      skill,
      /echo each affected-surfaces\s+entry above verbatim as `surfaces\[\]\.surface`/
    )
    const uiSkill = readText('.opencode/skills/ui-verification/SKILL.md')
    assert.match(
      uiSkill,
      /classification base from delivery-workflow §5 Step 2/
    )
    assert.match(
      uiSkill,
      /echoes the audit prompt's affected-surfaces entries verbatim/
    )
  })

  it('has no stale § references in delivery-workflow', () => {
    const skill = readText('.opencode/skills/delivery-workflow/SKILL.md')
    const lines = skill.split('\n')

    // Section map: `## N.` headings own the scope until the next `##` heading;
    // `### Step M` headings register per numbered section.
    const numberedSections = new Set<number>()
    const stepsBySection = new Map<number, Set<number>>()
    let currentSection: number | null = null
    for (const line of lines) {
      const numbered = line.match(/^## (\d+)\./)
      if (numbered) {
        currentSection = Number(numbered[1])
        numberedSections.add(currentSection)
        continue
      }
      if (line.startsWith('## ')) {
        // Unnumbered `##` headings (e.g. `## Verification`) end the scope.
        currentSection = null
        continue
      }
      const step = line.match(/^### Step (\d+)/)
      if (step && currentSection !== null) {
        const steps = stepsBySection.get(currentSection) ?? new Set<number>()
        steps.add(Number(step[1]))
        stepsBySection.set(currentSection, steps)
      }
    }

    const dangling: string[] = []
    for (const match of skill.matchAll(/§(\d+)(?: step (\d+))?/gi)) {
      const section = Number(match[1])
      const step = match[2] === undefined ? null : Number(match[2])
      const label = `§${section}${step === null ? '' : ` step ${step}`}`
      if (!numberedSections.has(section)) {
        dangling.push(`${label}: no "## ${section}." section heading`)
        continue
      }
      if (step !== null && !stepsBySection.get(section)?.has(step)) {
        dangling.push(
          `${label}: no "### Step ${step}" heading in section ${section}`
        )
      }
    }
    assert.deepEqual(dangling, [])
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
