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

  it('wires Playwright E2E into CI on PRs and main', () => {
    const ci = readText('.github/workflows/ci.yml')
    const e2eJob = ci.indexOf('  e2e:\n')

    assert.ok(e2eJob >= 0, 'expected e2e job to exist')
    assert.match(ci, /pull_request:\n\s+branches:\n\s+- "main"/)
    assert.match(ci, /push:\n\s+branches:\n\s+- "\\*\\*"/)
    assert.match(
      ci,
      /e2e:[\s\S]*needs: \[build\][\s\S]*timeout-minutes: 10[\s\S]*if: \$\{\{ github\.event_name == 'pull_request' \|\| github\.ref == 'refs\/heads\/main' \}\}/
    )
    const clusterStep = ci.indexOf('- name: Start local cluster', e2eJob)
    const clusterStart = ci.indexOf('./bin/reproctl cluster up', e2eJob)
    const workspaceStart = ci.indexOf(
      './bin/reproctl start --wait --timeout 300s workspace',
      e2eJob
    )

    assert.match(ci, /Install Playwright Chromium/)

    const ctlptlInstall = ci.indexOf('Install ctlptl', e2eJob)
    assert.ok(clusterStart >= 0, 'expected e2e job to start the cluster')
    assert.ok(clusterStep >= 0, 'expected e2e job cluster step to exist')
    assert.ok(ctlptlInstall >= 0, 'expected e2e job to install ctlptl')
    assert.ok(
      ctlptlInstall < clusterStep,
      'expected ctlptl install before cluster startup'
    )
    assert.match(ci.slice(ctlptlInstall, clusterStep), /mkdir -p tmp\/ci-bin/)
    assert.match(
      ci.slice(ctlptlInstall, clusterStep),
      /https:\/\/github\.com\/tilt-dev\/ctlptl\/releases\/download\/v0\.8\.43\/ctlptl\.0\.8\.43\.linux\.x86_64\.tar\.gz/
    )
    assert.match(
      ci.slice(ctlptlInstall, clusterStep),
      /46c7b0c53213a141ef0bae8838d50ad35461406b0e884a8b1387ed12a9e5da95/
    )
    assert.match(
      ci.slice(ctlptlInstall, clusterStep),
      /tmp\/ci-bin\/ctlptl version/
    )
    assert.match(
      ci.slice(clusterStep, workspaceStart),
      /PATH="\$PWD\/tmp\/ci-bin:\$PATH" \.\/bin\/reproctl cluster up/
    )
    const portlessInstall = ci.indexOf('Install portless', e2eJob)
    assert.ok(portlessInstall >= 0, 'expected e2e job to install portless')
    assert.ok(
      portlessInstall < workspaceStart,
      'expected portless install before workspace startup'
    )
    assert.match(
      ci.slice(portlessInstall, workspaceStart),
      /npm install --prefix tmp\/portless portless@0\.7/
    )
    assert.match(
      ci.slice(portlessInstall, workspaceStart),
      /tmp\/ci-bin\/portless --version/
    )
    assert.match(
      ci.slice(portlessInstall, workspaceStart),
      /tmp\/portless\/node_modules\/\.bin\/portless/
    )
    assert.ok(
      workspaceStart >= 0,
      'expected e2e job to start workspace services'
    )
    const diagnosticsStep = ci.indexOf(
      '- name: Dump service diagnostics on failure',
      e2eJob
    )
    const seedDatabase = ci.indexOf('- name: Seed the test database', e2eJob)

    assert.ok(
      diagnosticsStep >= 0,
      'expected e2e job to dump service diagnostics on failure'
    )
    assert.ok(
      workspaceStart < diagnosticsStep,
      'expected diagnostics after workspace startup'
    )
    assert.ok(
      diagnosticsStep < seedDatabase,
      'expected diagnostics before database seeding'
    )
    assert.match(ci.slice(diagnosticsStep, seedDatabase), /if: failure\(\)/)
    assert.match(
      ci.slice(diagnosticsStep, seedDatabase),
      /PATH="\$PWD\/tmp\/ci-bin:\$PATH" \.\/bin\/reproctl status/
    )
    assert.match(
      ci.slice(diagnosticsStep, seedDatabase),
      /PATH="\$PWD\/tmp\/ci-bin:\$PATH" \.\/bin\/reproctl logs -n 200/
    )
    assert.match(
      ci.slice(diagnosticsStep, seedDatabase),
      /kubectl get pods,svc,endpoints -A -o wide/
    )
    assert.ok(
      clusterStart < workspaceStart,
      'expected cluster startup before workspace services'
    )
    assert.match(
      ci.slice(workspaceStart),
      /PATH="\$PWD\/tmp\/ci-bin:\$PATH" \.\/bin\/reproctl start --wait --timeout 300s workspace/
    )
    assert.match(ci, /\.\/bin\/reproctl db seed/)
    assert.match(
      ci,
      /xvfb-run --auto-servernum pnpm exec playwright test --project chromium/
    )
    assert.match(ci, /Upload Playwright artifacts on failure/)
  })

  it('keeps ctlptl on the proto asdf tool pin', () => {
    const prototools = readText('.prototools')

    assert.match(prototools, /^"asdf:ctlptl" = "0\.8\.43"$/m)
    assert.doesNotMatch(prototools, /^ctlptl = "0\.8\.43"$/m)
    assert.doesNotMatch(prototools, /^\[tools\.ctlptl\]$/m)
    assert.doesNotMatch(
      prototools,
      /^ctlptl = "https:\/\/github\.com\/moonrepo\/plugins\/releases\/download\/asdf_backend-v0\.3\.3\/asdf_backend\.wasm"$/m
    )
    assert.doesNotMatch(prototools, /asdf-ctlptl/)
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
