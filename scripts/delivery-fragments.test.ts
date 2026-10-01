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
    assert.match(skill, /Known-artifact ignore list/i)
  })

  it('keeps the browser canary as troubleshooting-only guidance', () => {
    const skill = readText('.opencode/skills/ui-verification/SKILL.md')

    assert.match(skill, /Troubleshooting: silent browser input loss/)
    assert.match(skill, /### Browser input canary/)
    assert.match(skill, /Diagnostic-only eval interaction/)
    assert.doesNotMatch(skill, /agentBrowserVersion/)
    assert.doesNotMatch(skill, /"canary"/)
  })

  it('keeps the audit gate canary-free in delivery-workflow', () => {
    const skill = readText('.opencode/skills/delivery-workflow/SKILL.md')

    assert.doesNotMatch(skill, /canary/i)
    assert.doesNotMatch(skill, /agentBrowserVersion/)
    assert.match(skill, /3\. `freshness` — manifest `base` equals/)
    assert.match(
      skill,
      /4\. `audit-checkpoint` — top-level `auditCheckpointCommit`/
    )
    assert.match(skill, /5\. `surface-coverage` — every changed-surface name/)
    assert.match(skill, /6\. `surface-checkpoints` — every surface/)
    assert.match(skill, /7\. `audit-findings` — `audit\.md`/)
    assert.match(skill, /8\. The §4 implementation return's REP-1081/)
    assert.match(
      skill,
      /3\. Audit exactly the changed surfaces and applicable states/
    )
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
    assert.match(skill, /tree is dirty, escalate rather than classify/)
  })

  it('requires the tightened proof-bundle assertions in the gate', () => {
    const skill = readText('.opencode/skills/delivery-workflow/SKILL.md')

    assert.match(skill, /≥1 surface with ≥1 state/)
    assert.match(skill, /NON-EMPTY screenshot path/)
    assert.match(
      skill,
      /pillar \| severity \| evidence screenshot \| description \| disposition/
    )
    assert.match(skill, /\| none \| none \| none \| no findings \| none \|/)
  })

  it('documents both real exit-1 modes of the proof-bundle assertion', () => {
    const skill = readText('.opencode/skills/delivery-workflow/SKILL.md')

    assert.match(skill, /parse from the first `\{` line/)
    assert.match(skill, /stderr has `ERROR:` and there is NO JSON/)
  })

  it('rejects a header-only audit.md and reserves `none` for the sentinel row', () => {
    const skill = readText('.opencode/skills/delivery-workflow/SKILL.md')

    // A header with no rows is vacuous — the audit must carry ≥1
    // dispositioned finding row or the exact no-findings row.
    assert.match(skill, /≥1 dispositioned finding/)
    // `none` is not a finding-row disposition — it is reserved for the
    // no-findings sentinel row only (a `none` finding is neither fixed nor
    // filed and would let review start without resolution).
    assert.match(skill, /`none` is reserved for the exact no-findings sentinel/)
    assert.doesNotMatch(
      skill,
      /disposition \(`fixed <commit>` \| `filed REP-xxx` \| `none`\)/
    )
    const uiSkill = readText('.opencode/skills/ui-verification/SKILL.md')
    assert.match(uiSkill, /never for a finding row/)
  })

  it('classifies post-gate changes from the last successful audit checkpoint', () => {
    const skill = readText('.opencode/skills/delivery-workflow/SKILL.md')

    assert.match(
      skill,
      /If the fix changed UI behavior, classify from the last successful UI audit checkpoint/
    )
    assert.match(
      skill,
      /After the non-blocker sweep, classify its delta from the last successful UI audit checkpoint/
    )
    assert.match(skill, /last successful audit checkpoint/)
    assert.match(skill, /final UI changes[\s\S]*?current audit coverage/)
    assert.match(skill, /after rebase[\s\S]*?last successful audit checkpoint/i)
    assert.doesNotMatch(skill, /pnpm run ui:classify --base origin\/main/g)
  })

  it('preserves per-surface evidence and advances audit checkpoints only on success', () => {
    const skill = readText('.opencode/skills/delivery-workflow/SKILL.md')
    const uiSkill = readText('.opencode/skills/ui-verification/SKILL.md')

    assert.match(skill, /top-level `auditCheckpointCommit`/)
    assert.match(skill, /each changed surface's\s+`auditedAtCommit`/)
    assert.match(
      skill,
      /P1\/P2 fix commit[\s\S]*?changes UI behavior[\s\S]*?discard the current candidate[\s\S]*?fresh candidate before promotion/i
    )
    assert.match(
      skill,
      /Write each candidate to a unique path[\s\S]*?Store new screenshots under the unique\s+candidate path/
    )
    assert.match(
      skill,
      /Only after every assertion and required disposition passes[\s\S]*?promote the candidate/i
    )
    assert.match(
      skill,
      /Only after every assertion and required disposition passes[\s\S]*?advance the successful audit checkpoint/i
    )
    assert.match(
      skill,
      /Carry forward prior surface entries[\s\S]*?valid top-level and per-surface provenance[\s\S]*?legacy manifest[\s\S]*?do not carry\s+forward unproven entries/i
    )
    assert.match(
      skill,
      /If the full delta confirms no audited UI behavior changed[\s\S]*?reuse valid evidence[\s\S]*?Do not start the stack or advance the checkpoint/
    )
    assert.match(
      skill,
      /If any audited UI behavior or relevant state changed[\s\S]*?only the changed surfaces and their applicable states/
    )
    assert.doesNotMatch(skill, /rm -rf tmp\/ui-verification/)
    assert.match(uiSkill, /`auditCheckpointCommit`/)
    assert.match(uiSkill, /`auditedAtCommit`/)
  })

  it('pins the capture-side manifest inputs (base and surface naming)', () => {
    const skill = readText('.opencode/skills/delivery-workflow/SKILL.md')

    assert.match(skill, /Set `base` to the audit baseline/)
    assert.match(skill, /echo each changed-surface entry verbatim as `surface`/)
    const uiSkill = readText('.opencode/skills/ui-verification/SKILL.md')
    assert.match(
      uiSkill,
      /classification base from delivery-workflow §5 Step 2/
    )
    assert.match(
      uiSkill,
      /echoes the audit prompt's changed-surface entries verbatim/
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

describe('REP-1707 review routing and convergence contract', () => {
  it('keeps standard review for all code changes and routes independent reviews by risk', () => {
    const skill = readText('.opencode/skills/delivery-workflow/SKILL.md')

    for (const pattern of [
      /Every code change[\s\S]*?standard review/i,
      /\*\*Standard-risk issues\*\*:\s*launch one `review` agent/,
      /Run `adversarial-review` only for high-risk `\/build` deliveries/,
      /Correctness \+ Security reviewer[\s\S]*?always spawned/,
      /Architecture \+ Conventions reviewer[\s\S]*?always spawned/,
      /Performance reviewer[\s\S]*?only spawned when data-heavy/,
      /For every security-sensitive change, regardless of aggregate risk,[\s\S]*?focused `security-review`/,
      /security-sensitive-only change remains standard-risk for adversarial routing/,
      /security-review[\s\S]*?additive to the standard reviewer/i,
      /2\+ signals[\s\S]*?high-risk/i,
    ]) {
      assert.match(skill, pattern)
    }
    assert.doesNotMatch(skill, /Every issue[^\n]*adversarial pass/i)
  })

  it('uses a justified relevant adversarial-technique subset across all instruction sources', () => {
    const skill = readText('.opencode/skills/delivery-workflow/SKILL.md')
    const standards = readText('.opencode/skills/review-standards/SKILL.md')
    const agent = readText('.opencode/agents/adversarial-review.md')

    for (const [source, text] of [
      ['delivery-workflow', skill],
      ['review-standards', standards],
      ['adversarial-review agent', agent],
    ]) {
      assert.match(
        text,
        /(?:relevant.{0,40}techniques|techniques.{0,40}relevant)/i,
        source
      )
      assert.match(text, /justify|justification/i, source)
      assert.match(text, /omit[^\n]*irrelevant|irrelevant[^\n]*omit/i, source)
      assert.match(
        text,
        /seven techniques[^\n]*available(?: options)?[^\n]*(?:not a required|not a mandatory) checklist/i,
        source
      )
      assert.doesNotMatch(
        text,
        /^(?![^\n]*\b(?:do not|don't|never|not required|not mandatory)\b)(?=[^\n]*\ball seven\b)(?=[^\n]*\b(?:must|required|mandatory|always|apply|use|perform|run)\b)[^\n]*$/im,
        source
      )
      assert.match(
        text,
        /direct.{0,60}(?:request|requested).{0,30}adversarial review/i,
        source
      )
    }
  })

  it('limits adversarial criterion reporting to changed-code failure modes', () => {
    const agent = readText('.opencode/agents/adversarial-review.md')

    assert.match(agent, /## Criterion failure modes/)
    assert.match(
      agent,
      /only criterion failure modes relevant to the changed code and selected techniques/i
    )
    assert.match(agent, /Do not rate every acceptance criterion/i)
    assert.doesNotMatch(agent, /## Requirements checklist/)
  })

  it('pins one exact HEAD across review lanes and advances the checkpoint after the full cycle', () => {
    const skill = readText('.opencode/skills/delivery-workflow/SKILL.md')

    assert.match(
      skill,
      /At the start of every review cycle, capture one exact HEAD SHA/i
    )
    assert.match(skill, /same exact HEAD SHA to every applicable review lane/i)
    assert.match(
      skill,
      /After all applicable review-lane results are collected[\s\S]*?set the last review checkpoint to that SHA/i
    )
    assert.match(skill, /git diff <review-checkpoint>\.\.<review-head-sha>/)
    assert.match(skill, /paths needed to reverify accepted blockers/i)
    assert.match(
      skill,
      /checkpoint advances only after the next full applicable review cycle/i
    )
  })

  it('propagates smoke-test failures to every applicable triggered review lane', () => {
    const skill = readText('.opencode/skills/delivery-workflow/SKILL.md')

    assert.match(
      skill,
      /append its structured failure context to every applicable triggered reviewer-lane prompt/i
    )
    for (const lane of [
      '`review`',
      '`security-review`',
      'Correctness + Security',
      'Architecture + Conventions',
      'Performance reviewer',
      '`adversarial-review`',
    ]) {
      assert.ok(skill.includes(lane), `missing smoke-test lane: ${lane}`)
    }
    assert.doesNotMatch(
      skill,
      /every reviewer prompt \(standard and adversarial\)/i
    )
  })

  it('consolidates evidenced blockers and bounds remediation without publishing unresolved blockers', () => {
    const skill = readText('.opencode/skills/delivery-workflow/SKILL.md')

    assert.match(skill, /underlying failure[\s\S]*?provenance/i)
    assert.match(skill, /concrete evidence[\s\S]*?actionable fix/i)
    assert.match(skill, /one consolidated blocker (?:set|batch)/i)
    assert.match(skill, /verify each accepted blocker/i)
    assert.match(
      skill,
      /endpoint diff `git diff <review-checkpoint>\.\.<review-head-sha>`[\s\S]*?paths needed to reverify accepted blockers/i
    )
    assert.match(skill, /3 fix attempts[\s\S]*?No fourth automatic fix pass/i)
    assert.match(
      skill,
      /accepted Blockers remaining[\s\S]*?do not push, create a PR, mark the issue publishable, or set it to In Review/i
    )
    assert.match(
      skill,
      /Do not create a PR or set `In Review` while any accepted Blocker remains/i
    )
    assert.match(skill, /Only after all accepted Blockers clear/i)
    assert.match(skill, /Never run non-blocker cleanup while Blockers remain/i)
  })

  it('does not require broad review or audit restarts for optional cleanup', () => {
    const skill = readText('.opencode/skills/delivery-workflow/SKILL.md')

    assert.match(
      skill,
      /optional cleanup[\s\S]*?must not cause an unrelated full review/i
    )
    assert.doesNotMatch(
      skill,
      /The adversarial pass is spawned for every issue/i
    )
  })

  it('rechecks final UI changes after rebase before publishing', () => {
    const skill = readText('.opencode/skills/delivery-workflow/SKILL.md')
    const publish = skill
      .split('\n## 7. Publish\n')[1]
      ?.split('\n## 8. Manual verification output')[0]

    assert.ok(publish, 'missing publish phase')
    assert.match(
      publish,
      /After rebase, classify the final delta from the last successful audit checkpoint[\s\S]*?inspect the full delta for indirect UI effects[\s\S]*?Audit only newly affected surfaces\/states[\s\S]*?otherwise reuse the valid successful evidence without advancing the checkpoint[\s\S]*?final UI changes must have current audit coverage before publish[\s\S]*?If the rebase or later publish step changes UI behavior, return to §5[\s\S]*?do not publish until the candidate passes assertions and dispositions/
    )
    assert.ok(
      publish.indexOf('After rebase, classify the final delta') <
        publish.indexOf('### Step 2 — push with retry'),
      'final UI coverage must precede the publish push'
    )
  })
})
