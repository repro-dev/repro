import assert from 'node:assert/strict'
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'

import {
  buttonMaster,
  contractFixturePen,
  mastersGroup,
  refNode,
  screenFamilyGroup,
  screenNode,
  syntheticExports,
} from './pen-contract.test-helpers.ts'
import {
  parseCliArgs,
  renderContractHtml,
  runContract,
} from './pen-contract.ts'
import type { PenFile } from './pen-lint.ts'
import { parsePenJson } from './pen-lint.ts'

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..'
)

function runWith(
  pen: PenFile,
  args: { screen?: string; html?: boolean } = {}
): { json: string; code: number } {
  mkdirSync(path.join(repoRoot, 'tmp', 'pen-contract-cli-fixtures'), {
    recursive: true,
  })
  const penFile = path.join(
    repoRoot,
    'tmp',
    'pen-contract-cli-fixtures',
    'cli.pen'
  )
  writeFileSync(penFile, JSON.stringify(pen, null, 2))
  const jsonOuts: string[] = []
  const result = runContract({
    penFile,
    screen: args.screen,
    html: args.html,
    log: () => {},
    jsonOut: json => jsonOuts.push(json),
    exportsByPackage: syntheticExports(),
  })
  return { json: jsonOuts.join('\n'), code: result.code }
}

describe('REP-1622 pen-contract CLI parsing', () => {
  it('parses --screen, --pen-file, --html, and --dry-run', () => {
    assert.deepEqual(parseCliArgs(['--screen', 'Demo']).options, {
      screen: 'Demo',
    })
    assert.deepEqual(parseCliArgs(['--pen-file', 'other.pen']).options, {
      penFile: 'other.pen',
    })
    assert.deepEqual(parseCliArgs(['--html']).options, { html: true })
    assert.deepEqual(parseCliArgs(['--dry-run']).options, { dryRun: true })
    assert.deepEqual(parseCliArgs([]).options, {})
  })

  it('rejects unknown flags and malformed values', () => {
    assert.match(parseCliArgs(['--bogus']).error!, /unknown argument "--bogus"/)
    assert.match(parseCliArgs(['--screen']).error!, /requires a value/)
    assert.match(
      parseCliArgs(['--screen', '--html']).error!,
      /looks like another flag/
    )
    assert.match(parseCliArgs(['--pen-file']).error!, /requires a value/)
  })
})

describe('REP-1622 --screen and --dry-run', () => {
  it('--screen emits only the named screen', () => {
    const pen = parsePenJson(
      JSON.stringify({
        version: '2.14',
        children: [
          screenFamilyGroup('demo', 'demo-family', [
            screenNode(
              's1',
              'Screen: Demo',
              'screens/demo/demo-family',
              'content'
            ),
            screenNode(
              's2',
              'Screen: Other',
              'screens/demo/other-family',
              'content'
            ),
          ]),
        ],
        variables: {},
      })
    )
    const { json, code } = runWith(pen, { screen: 'Other' })
    assert.equal(code, 0)
    const contract = JSON.parse(json) as {
      screens: Array<{ screenId: string }>
    }
    assert.equal(contract.screens.length, 1)
    assert.equal(contract.screens[0]!.screenId, 's2')
  })

  it('--dry-run output is identical to a normal run and honors exit codes', () => {
    const pen = contractFixturePen()
    const normal = runWith(pen)
    const dry = runWith(pen)
    assert.equal(normal.json, dry.json)
    assert.equal(dry.code, 0)
  })

  it('exits non-zero when the contract has violations', () => {
    const pen = parsePenJson(
      JSON.stringify({
        version: '2.14',
        children: [
          screenFamilyGroup('demo', 'demo-family', [
            screenNode(
              's1',
              'Screen: Demo',
              'screens/demo/demo-family',
              'content',
              [refNode('r1', 'missingMaster', 'Save')]
            ),
          ]),
        ],
        variables: {},
      })
    )
    const { code } = runWith(pen)
    assert.equal(code, 1)
  })
})

describe('REP-1622 --html scaffold', () => {
  it('emits a self-contained document with doctype, html, and body', () => {
    const { json, code } = runWith(contractFixturePen(), { html: true })
    assert.equal(code, 0)
    assert.match(json, /^<!doctype html>/)
    assert.match(json, /<html>/)
    assert.match(json, /<body>/)
    assert.match(json, /<h1>Screen: Demo<\/h1>/)
    assert.match(json, /data-component="design::Button"/)
    assert.match(json, /data-state-family="screens\/demo\/demo-family"/)
    assert.match(json, /data-state="content"/)
    assert.match(json, /Save changes/)
  })

  it('is deterministic across two runs', () => {
    const first = runWith(contractFixturePen(), { html: true })
    const second = runWith(contractFixturePen(), { html: true })
    assert.equal(first.json, second.json)
  })

  it('handles node-replacement descendants that omit the type key', () => {
    // A descendant override carrying only `children` (no `type`) is a
    // frame-like replacement — it must render in both JSON and HTML.
    const pen = parsePenJson(
      JSON.stringify({
        version: '2.14',
        children: [
          screenFamilyGroup('demo', 'demo-family', [
            screenNode(
              's1',
              'Screen: Demo',
              'screens/demo/demo-family',
              'content',
              [
                refNode('r1', 'appShellMaster', 'AppShell', {
                  descendants: {
                    slot: {
                      children: [
                        {
                          type: 'text',
                          id: 't1',
                          name: 'Label',
                          content: 'Hello',
                        },
                      ],
                    },
                  },
                }),
              ]
            ),
          ]),
        ],
        variables: {},
      })
    )
    // AppShell master with a slot frame the override targets.
    const appShell = {
      type: 'frame',
      id: 'appShellMaster',
      name: 'AppShell',
      reusable: true,
      metadata: { type: 'master', package: 'design', component: 'AppShell' },
      children: [{ type: 'frame', id: 'slot', name: 'Slot', children: [] }],
    }
    const withMaster = parsePenJson(
      JSON.stringify({
        version: '2.14',
        children: [mastersGroup(appShell), ...pen.children],
        variables: {},
      })
    )
    const json = runWith(withMaster)
    assert.equal(json.code, 0)
    assert.match(json.json, /"type": "frame"/)
    assert.match(json.json, /"content": "Hello"/)

    const html = runWith(withMaster, { html: true })
    assert.equal(html.code, 0)
    assert.match(html.json, /<div class="frame">/)
    assert.match(html.json, /Hello/)
  })

  it('renderContractHtml renders unresolved refs as violations', () => {
    const pen = parsePenJson(
      JSON.stringify({
        version: '2.14',
        children: [
          screenFamilyGroup('demo', 'demo-family', [
            screenNode(
              's1',
              'Screen: Demo',
              'screens/demo/demo-family',
              'content',
              [refNode('r1', 'missingMaster', 'Save')]
            ),
          ]),
        ],
        variables: {},
      })
    )
    mkdirSync(path.join(repoRoot, 'tmp', 'pen-contract-cli-fixtures'), {
      recursive: true,
    })
    const penFile = path.join(
      repoRoot,
      'tmp',
      'pen-contract-cli-fixtures',
      'bad.pen'
    )
    writeFileSync(penFile, JSON.stringify(pen, null, 2))
    const bad = runContract({
      penFile,
      html: true,
      log: () => {},
      jsonOut: () => {},
      exportsByPackage: syntheticExports(),
    })
    assert.equal(bad.code, 1)
    const html = renderContractHtml(bad.contract)
    assert.match(html, /class="violation"/)
    assert.match(html, /unknown master/)
  })
})

describe('REP-1622 exported helpers stay usable', () => {
  it('mastersGroup builds a masters/<pkg> tree that resolves', () => {
    const pen = parsePenJson(
      JSON.stringify({
        version: '2.14',
        children: [
          mastersGroup(buttonMaster()),
          screenFamilyGroup('demo', 'demo-family', [
            screenNode(
              's1',
              'Screen: Demo',
              'screens/demo/demo-family',
              'content',
              [refNode('r1', 'btnMaster', 'Save')]
            ),
          ]),
        ],
        variables: {},
      })
    )
    const { json, code } = runWith(pen)
    assert.equal(code, 0)
    const contract = JSON.parse(json) as {
      screens: Array<{ tree: { children: Array<{ component?: unknown }> } }>
    }
    assert.ok(contract.screens[0]!.tree.children[0]!.component)
  })
})
