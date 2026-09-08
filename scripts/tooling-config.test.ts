import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..'
)

// Matches ANY reference to the render harness by name inside a test file —
// spawn sites (execFileSync('pnpm', ['run', 'render-stories-html'])), direct
// tsx invocations, shared-helper imports, or prose. Bare-name-broad on
// purpose (REP-1658 review): a narrow spawn-shape regex let a future file
// that triggers a render another way escape the serialization contract
// silently, and any file that can render writes tmp/storybook-html
// non-atomically. This file is excluded from the candidate set below so its
// own prose about the harness cannot self-match.
const RENDER_REFERENCE_PATTERN = /render-stories-html/

function readText(relativePath: string) {
  return readFileSync(path.join(repoRoot, relativePath), 'utf8')
}

describe('REP-642 tooling wiring', () => {
  it('keeps the workspace lint entrypoint and lint-staged order aligned', () => {
    const packageJson = JSON.parse(readText('package.json')) as {
      scripts: Record<string, string>
      'lint-staged': Record<string, string[]>
    }

    assert.equal(packageJson.scripts.lint, 'oxlint .')
    assert.equal(
      packageJson.scripts['fmt:check'],
      'prettier --check "**/*.{ts,tsx}" --ignore-path .gitignore'
    )
    assert.deepEqual(packageJson['lint-staged']['*.{ts,tsx}'], [
      'oxlint --fix',
      'prettier --write',
    ])
  })

  it('keeps the shared oxlint ignore list focused on generated outputs', () => {
    const oxlintConfig = JSON.parse(readText('.oxlintrc.json')) as {
      ignorePatterns: string[]
    }

    assert.deepEqual(oxlintConfig.ignorePatterns, [
      '**/dist',
      '**/storybook-static',
      'packages/domain/generated',
      'packages/domain/src/generated',
      'packages/wire-formats/generated',
      'packages/wire-formats/src/generated',
      'packages/tdl/src/cli/*.ohm-bundle.*',
    ])
  })

  it('mirrors the generated-output ignore paths in .gitignore', () => {
    const gitignoreEntries = new Set(
      readText('.gitignore')
        .split(/\r?\n/)
        .map(line => line.trim())
        .filter(line => line.length > 0 && !line.startsWith('#'))
    )

    for (const pattern of [
      'packages/domain/generated',
      'packages/domain/src/generated',
      'packages/wire-formats/generated',
      'packages/wire-formats/src/generated',
      'packages/tdl/src/cli/*.ohm-bundle.*',
    ]) {
      assert.ok(gitignoreEntries.has(pattern), `missing ${pattern}`)
    }
  })

  it('enforces design-system conventions via forbid-elements and forbid-dom-props', () => {
    const oxlintConfig = JSON.parse(readText('.oxlintrc.json')) as {
      rules: Record<string, unknown>
      plugins: string[]
      overrides: Array<{ files: string[]; rules: Record<string, string> }>
    }

    // Plugins include react for the new rules
    assert.ok(
      oxlintConfig.plugins.includes('react'),
      'react plugin must be configured'
    )

    // Rules exist and are set to error
    const forbidElements = oxlintConfig.rules['react/forbid-elements'] as [
      string,
      { forbid: string[] },
    ]
    const forbidDomProps = oxlintConfig.rules['react/forbid-dom-props'] as [
      string,
      { forbid: string[] },
    ]

    assert.ok(forbidElements, 'react/forbid-elements rule must be configured')
    assert.equal(forbidElements[0], 'error')
    assert.deepEqual(forbidElements[1].forbid, ['div', 'span'])

    assert.ok(forbidDomProps, 'react/forbid-dom-props rule must be configured')
    assert.equal(forbidDomProps[0], 'error')
    assert.deepEqual(forbidDomProps[1].forbid, ['style'])

    // Two overrides: (1) test/story/token files — all rules off,
    // (2) design package — only react rules off, design rules enforced.
    assert.ok(
      oxlintConfig.overrides.length >= 2,
      'at least two overrides must exist'
    )

    const exclusionOverride = oxlintConfig.overrides[0]!
    assert.ok(exclusionOverride.files.includes('*.test.tsx'))
    assert.ok(exclusionOverride.files.includes('*.stories.tsx'))
    assert.ok(exclusionOverride.files.includes('packages/design/src/tokens/**'))
    assert.equal(exclusionOverride.rules['react/forbid-elements'], 'off')
    assert.equal(exclusionOverride.rules['react/forbid-dom-props'], 'off')

    const designOverride = oxlintConfig.overrides[1]!
    assert.ok(designOverride.files.includes('packages/design/src/**'))
    assert.equal(designOverride.rules['react/forbid-elements'], 'off')
    assert.equal(designOverride.rules['react/forbid-dom-props'], 'off')
    // Design rules are NOT disabled for the design package override
    assert.equal(
      designOverride.rules['@repro/oxlint-plugin-design/no-hardcoded-color'],
      undefined
    )
    assert.equal(
      designOverride.rules['@repro/oxlint-plugin-design/no-hardcoded-spacing'],
      undefined
    )
    assert.equal(
      designOverride.rules['@repro/oxlint-plugin-design/no-raw-palette'],
      undefined
    )
    assert.equal(
      designOverride.rules['@repro/oxlint-plugin-design/no-classname-prop'],
      undefined
    )
  })

  it('runs oxlint before the Prettier check in CI', () => {
    const ci = readText('.github/workflows/ci.yml')
    const toolingTestStep = ci.indexOf(
      '- name: Run tooling config regression test'
    )
    const lintStep = ci.indexOf('- name: Run workspace lint (Oxlint)')
    const fmtStep = ci.indexOf('- name: Check formatting (Prettier)')

    assert.ok(
      toolingTestStep >= 0,
      'expected tooling config test step to exist'
    )
    assert.ok(lintStep >= 0, 'expected CI lint step to exist')
    assert.ok(fmtStep >= 0, 'expected CI format step to exist')
    assert.ok(
      toolingTestStep < lintStep,
      'expected tooling config test to run before lint'
    )
    assert.ok(lintStep < fmtStep, 'expected lint to run before formatting')
    assert.match(
      ci.slice(toolingTestStep, lintStep),
      /run: pnpm run test:tooling-config/
    )
    assert.match(ci.slice(lintStep, fmtStep), /run: pnpm run lint/)
    assert.match(ci.slice(fmtStep), /run: pnpm run fmt:check/)
  })

  it('guards pre-commit against direct commits on main', () => {
    const preCommitHook = readText('.husky/pre-commit')

    assert.match(
      preCommitHook,
      /git symbolic-ref --quiet --short HEAD 2>\/dev\/null \|\| true/
    )
    assert.match(preCommitHook, /if \[ "\$current_branch" = "main" \]; then/)
    assert.match(preCommitHook, /exit 1/)
    assert.match(
      preCommitHook,
      /existing worktree or local branch[\s\S]*new worktree or branch/i
    )
  })
})

describe('REP-1245 tool version pinning', () => {
  it('keeps Moon and Proto pins consistent across runtime and documentation', () => {
    const prototools = readText('.prototools')
    const toolchains = readText('.moon/toolchains.yml')
    const dockerfile = readText('infra/Dockerfile')
    const buildAndTestSkill = readText(
      '.opencode/skills/build-and-test/SKILL.md'
    )

    assert.match(prototools, /^moon = "2\.2\.5"$/m)
    assert.match(prototools, /^proto = "0\.57\.2"$/m)
    assert.match(toolchains, /^  version: 0\.57\.2$/m)
    assert.match(dockerfile, /npm add --global @moonrepo\/cli@2\.2\.5/)

    assert.match(buildAndTestSkill, /@moonrepo\/cli@2\.2\.5/)
    assert.match(buildAndTestSkill, /moon = "2\.2\.5"/)
    assert.match(buildAndTestSkill, /proto = "0\.57\.2"/)
    assert.match(buildAndTestSkill, /proto\.version: 0\.57\.2/)
  })
})

describe('REP-1658 render-on-demand serialization', () => {
  it('runs every render-on-demand test file under --test-concurrency=1', () => {
    const packageJson = JSON.parse(readText('package.json')) as {
      scripts: Record<string, string>
    }
    const script = packageJson.scripts['test:tooling-config'] ?? ''
    const invocations = script.split('&&').map(part => part.trim())

    // `node --test` runs each listed file as a concurrent child process by
    // default. Test files that render on demand spawn render-stories-html,
    // which writes tmp/storybook-html non-atomically (writeFileSync) while
    // sibling files read it — on a cold tmp/ two concurrent full renders race
    // mid-rewrite and fail assertions spuriously. Every such file must sit in
    // an invocation serialized with --test-concurrency=1 (the render-on-demand
    // files live in their own second invocation; the pure unit-test files keep
    // running concurrently in the first).
    const scriptsDir = path.join(repoRoot, 'scripts')
    const renderFiles = readdirSync(scriptsDir)
      .filter(file => file.endsWith('.test.ts'))
      // This file names the harness in its own prose about the serialization
      // contract; exclude it so the bare-name pattern cannot self-match (it
      // renders nothing and belongs to the first, concurrent invocation).
      .filter(file => file !== 'tooling-config.test.ts')
      .filter(file =>
        RENDER_REFERENCE_PATTERN.test(
          readFileSync(path.join(scriptsDir, file), 'utf8')
        )
      )
      .map(file => `scripts/${file}`)

    assert.ok(
      renderFiles.length >= 2,
      'expected to discover the render-on-demand gate test files ' +
        `(found: ${renderFiles.join(', ') || 'none'})`
    )

    for (const file of renderFiles) {
      const hosts = invocations.filter(invocation => invocation.includes(file))
      assert.equal(
        hosts.length,
        1,
        `${file} must appear in exactly one test:tooling-config invocation`
      )
      assert.ok(
        hosts[0]!.includes('--test-concurrency=1'),
        `${file} references render-stories-html, so it can render ` +
          `tmp/storybook-html on demand and must run under ` +
          `--test-concurrency=1 — concurrent renders race mid-rewrite on cold state`
      )
    }
  })
})

describe('REP-1658 flat-type-hierarchy re-arm pins', () => {
  it('keeps flat-type-hierarchy out of detector.ignoreRules', () => {
    const config = JSON.parse(readText('.impeccable/config.json')) as {
      detector?: { ignoreRules?: string[] }
    }
    // Semantics (chosen, per the REP-1658 review): assert on the actual array
    // — the rule id must be ABSENT from detector.ignoreRules. An empty array
    // and an array holding other rule ids both pass, because the ignoreRules
    // mechanism stays available for repo-wide policy; only flat-type-hierarchy
    // must never return to it. REP-1658 re-armed the rule: its residual
    // findings carry per-story waivers (see .impeccable/README.md re-arm
    // record), and a project-wide ignore would mute the rule on all future
    // app-surface pages again — silently, unless this pin fails.
    const ignoreRules = config.detector?.ignoreRules ?? []
    assert.ok(
      Array.isArray(ignoreRules),
      'detector.ignoreRules must be an array when present'
    )
    assert.equal(
      ignoreRules.includes('flat-type-hierarchy'),
      false,
      'flat-type-hierarchy is suppressed project-wide in ' +
        '.impeccable/config.json — REP-1658 re-armed it via per-story waivers; ' +
        'do not silence it again (waive the firing story instead)'
    )
  })

  it('keeps detector.ignoreFiles from matching the rendered-scan directory', () => {
    const config = JSON.parse(readText('.impeccable/config.json')) as {
      detector?: { ignoreRules?: string[]; ignoreFiles?: string[] }
    }
    // Semantics (per the REP-1658 adversarial re-review): the CI detect step
    // (`npx impeccable detect tmp/storybook-html/ --json`) runs WITH this
    // config and scans exactly tmp/storybook-html/. An ignoreFiles entry that
    // matches that directory empties the scan — zero files in, zero findings
    // out — so the gate passes vacuously while the --no-config fixture tests
    // (hardcoded flag, config-independent) and the ignoreRules pin above stay
    // green. No entry may therefore name the tmp/ tree at any path position
    // (`tmp`, `tmp/**`, `tmp/storybook-html/**`, `**/tmp/**`); ignoreFiles
    // exists for generated/build outputs (dist/, out/, storybook-static/,
    // generated/), never the scan target. Do not silence the gate this way —
    // waive the firing story instead.
    const ignoreFiles = config.detector?.ignoreFiles ?? []
    assert.ok(
      Array.isArray(ignoreFiles),
      'detector.ignoreFiles must be an array when present'
    )
    const coveringScanDir = ignoreFiles.filter(
      pattern => pattern.startsWith('tmp') || pattern.split('/').includes('tmp')
    )
    assert.deepEqual(
      coveringScanDir,
      [],
      'detector.ignoreFiles has an entry that can match the rendered-scan ' +
        'directory tmp/storybook-html/ — the CI detect step scans that ' +
        'directory WITH this config, so the entry empties the scan and the ' +
        'gate passes vacuously with zero findings. Do not silence the gate; ' +
        'scope the entry away from tmp/ or waive the firing story instead.'
    )
  })
})
