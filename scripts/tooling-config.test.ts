import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
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
