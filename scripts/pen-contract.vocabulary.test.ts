// REP-1629: per-master closed override vocabulary regression tests (AC2/AC3):
// each master asserts resolved presentationalOverrides AND the absence of a
// warning for every mapped override, plus default-silent and warn-never-drop.
import assert from 'node:assert/strict'
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'

import {
  alertMaster,
  avatarMaster,
  avatarStackSummaryMaster,
  badgeMaster,
  buttonMaster,
  checkboxMaster,
  fullPageErrorMaster,
  inputMaster,
  mastersGroup,
  refNode,
  screenFamilyGroup,
  screenNode,
  stackMaster,
  syntheticExports,
  textFieldMaster,
  toggleMaster,
} from './pen-contract.test-helpers.ts'
import type { PenContract } from './pen-contract.ts'
import { runContract } from './pen-contract.ts'
import type { PenFile, PenNode } from './pen-lint.ts'
import { parsePenJson } from './pen-lint.ts'

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..'
)

function contractFor(pen: PenFile): {
  contract: PenContract
  code: number
} {
  mkdirSync(path.join(repoRoot, 'tmp', 'pen-contract-vocab-fixtures'), {
    recursive: true,
  })
  const penFile = path.join(
    repoRoot,
    'tmp',
    'pen-contract-vocab-fixtures',
    'vocab.pen'
  )
  writeFileSync(penFile, JSON.stringify(pen, null, 2))
  const result = runContract({
    penFile,
    log: () => {},
    jsonOut: () => {},
    exportsByPackage: syntheticExports(),
  })
  return { contract: result.contract, code: result.code }
}

/** One screen holding the given master plus one ref per instance. */
function vocabPen(master: PenNode, refs: PenNode[]): PenFile {
  return parsePenJson(
    JSON.stringify({
      version: '2.14',
      children: [
        mastersGroup(master),
        screenFamilyGroup('demo', 'demo-family', [
          screenNode(
            's1',
            'Screen: Demo',
            'screens/demo/demo-family',
            'content',
            refs
          ),
        ]),
      ],
      variables: {},
    })
  )
}

/** Assert a warning matching `needle` fired (warn-never-drop invariant). */
function warns(contract: PenContract, needle: string): void {
  assert.ok(
    contract.warnings.some(w => w.includes(needle)),
    contract.warnings.join('\n')
  )
}

describe('REP-1629 Button vocabulary (value validation)', () => {
  it('warns on an out-of-vocabulary opacity value (warn-never-drop)', () => {
    const { contract } = contractFor(
      vocabPen(buttonMaster(), [
        refNode('r1', 'btnMaster', 'Dimmed', {
          opacity: 0.3,
          descendants: { btnLabel: { content: 'Dimmed' } },
        }),
      ])
    )
    assert.deepEqual(contract.warnings, [
      'Button: unmapped override "opacity"=0.3',
    ])
  })
})

describe('REP-1629 Checkbox vocabulary (master dDpF6)', () => {
  it('maps Box/Check/Label overrides to checked/label and stays silent', () => {
    const { contract, code } = contractFor(
      vocabPen(checkboxMaster(), [
        refNode('rOff', 'checkboxMaster', 'Checkbox Off', {
          descendants: { AXIyz: { content: 'Email me digests' } },
        }),
        refNode('rOn', 'checkboxMaster', 'Checkbox On', {
          descendants: {
            sa63x: { fill: '$color-primary', strokeWidth: 0 },
            p2muX: { enabled: true },
            AXIyz: { content: 'Email me digests' },
          },
        }),
        refNode('rDefault', 'checkboxMaster', 'Checkbox Default'),
      ])
    )
    assert.equal(code, 0)
    const refs = contract.screens[0]!.tree.children!
    assert.deepEqual(refs[0]!.presentationalOverrides, {
      label: 'Email me digests',
    })
    assert.deepEqual(refs[1]!.presentationalOverrides, {
      checked: true,
      label: 'Email me digests',
    })
    assert.equal(refs[2]!.presentationalOverrides, undefined)
    assert.deepEqual(contract.warnings, [])
  })

  it('still warns on an out-of-vocabulary Checkbox Box key', () => {
    const { contract } = contractFor(
      vocabPen(checkboxMaster(), [
        refNode('r1', 'checkboxMaster', 'Checkbox', {
          descendants: { sa63x: { fill: '$color-primary', effect: [] } },
        }),
      ])
    )
    warns(
      contract,
      'Checkbox: unmapped descendant override "sa63x" -> "effect"'
    )
  })
})

describe('REP-1629 Stack vocabulary (master oj0de)', () => {
  it('maps Child 1 content to children, absorbs hidden children, maps gap', () => {
    const { contract, code } = contractFor(
      vocabPen(stackMaster(), [
        refNode('rHelp', 'stackMaster', 'Help Text Stack', {
          gap: 0,
          padding: ['$spacing-md', '$spacing-xl'],
          descendants: {
            Vx0bQ: {
              type: 'text',
              id: 'J72lVL',
              name: 'Help Text',
              fill: '$color-text-muted',
              textGrowth: 'fixed-width',
              width: 'fill_container',
              content: 'Default page size is 50 accounts.',
              fontFamily: 'Inter',
              fontSize: 12,
              fontWeight: 'normal',
            },
            E0ZK6: { enabled: false },
            D6MKAC: { enabled: false },
          },
        }),
        refNode('rGap', 'stackMaster', 'Stack (gap lg)', {
          gap: '$spacing-lg',
        }),
        refNode('rDefault', 'stackMaster', 'Stack default'),
      ])
    )
    assert.equal(code, 0)
    const refs = contract.screens[0]!.tree.children!
    assert.deepEqual(refs[0]!.presentationalOverrides, {
      children: 'Default page size is 50 accounts.',
      gap: 0,
    })
    assert.deepEqual(refs[1]!.presentationalOverrides, { gap: '$spacing-lg' })
    assert.equal(refs[2]!.presentationalOverrides, undefined)
    assert.deepEqual(contract.warnings, [])
  })

  it('warns on an enabled=true Child override (out of vocabulary)', () => {
    const { contract } = contractFor(
      vocabPen(stackMaster(), [
        refNode('r1', 'stackMaster', 'Stack', {
          descendants: { E0ZK6: { enabled: true } },
        }),
      ])
    )
    warns(
      contract,
      'Stack: unmapped descendant override "E0ZK6" (enabled=true)'
    )
  })
})

describe('REP-1629 TextField vocabulary (master Q6CWT)', () => {
  it('maps Label/Value to label/value, absorbs Error hidden row', () => {
    const { contract, code } = contractFor(
      vocabPen(textFieldMaster(), [
        refNode('rSearch', 'textFieldMaster', 'Search Field', {
          width: 'fill_container',
          descendants: {
            WGsF1: { content: 'Search accounts' },
            k7Szg: {
              content: 'Email or account ID',
              fill: '$color-text-muted',
            },
            v16Rdg: { enabled: false },
          },
        }),
        refNode('rDefault', 'textFieldMaster', 'TextField default'),
      ])
    )
    assert.equal(code, 0)
    const refs = contract.screens[0]!.tree.children!
    assert.deepEqual(refs[0]!.presentationalOverrides, {
      label: 'Search accounts',
      value: 'Email or account ID',
    })
    assert.equal(refs[1]!.presentationalOverrides, undefined)
    assert.deepEqual(contract.warnings, [])
  })

  it('warns on an unknown TextField descendant key', () => {
    const { contract } = contractFor(
      vocabPen(textFieldMaster(), [
        refNode('r1', 'textFieldMaster', 'TextField', {
          descendants: { WGsF1: { content: 'x', rotation: 90 } },
        }),
      ])
    )
    warns(
      contract,
      'TextField: unmapped descendant override "WGsF1" -> "rotation"'
    )
  })
})

describe('REP-1629 Toggle vocabulary (master OMduR)', () => {
  it('maps Track/Knob fill/x to checked and Label to label', () => {
    const { contract, code } = contractFor(
      vocabPen(toggleMaster(), [
        refNode('rOn', 'toggleMaster', 'Toggle On', {
          descendants: {
            d6Q9W: { fill: '$color-primary', strokeWidth: 0 },
            VYbf2: { x: 16, fill: '$color-text-inverse' },
            VZBQ5: { content: 'Notifications' },
          },
        }),
        refNode('rOff', 'toggleMaster', 'Toggle Off', {
          descendants: { VZBQ5: { content: 'Notifications' } },
        }),
        refNode('rDefault', 'toggleMaster', 'Toggle default'),
      ])
    )
    assert.equal(code, 0)
    const refs = contract.screens[0]!.tree.children!
    assert.deepEqual(refs[0]!.presentationalOverrides, {
      checked: true,
      label: 'Notifications',
    })
    assert.deepEqual(refs[1]!.presentationalOverrides, {
      label: 'Notifications',
    })
    assert.equal(refs[2]!.presentationalOverrides, undefined)
    assert.deepEqual(contract.warnings, [])
  })

  it('warns on an unrecognized Track fill value', () => {
    const { contract } = contractFor(
      vocabPen(toggleMaster(), [
        refNode('r1', 'toggleMaster', 'Toggle', {
          descendants: { d6Q9W: { fill: '$color-bogus' } },
        }),
      ])
    )
    warns(contract, 'Toggle: unmapped descendant override "d6Q9W" -> "fill"')
  })
})

describe('REP-1629 FullPageError vocabulary (master HkYOE)', () => {
  it('maps Title/Description content to title/description', () => {
    const { contract, code } = contractFor(
      vocabPen(fullPageErrorMaster(), [
        refNode('rError', 'fullPageErrorMaster', 'State: Error', {
          descendants: {
            enRw5: { content: 'Something went wrong' },
            VaehS: {
              content:
                'An unexpected error occurred. Please retry to reload this page.',
            },
          },
        }),
        refNode('rDefault', 'fullPageErrorMaster', 'FullPageError default'),
      ])
    )
    assert.equal(code, 0)
    const refs = contract.screens[0]!.tree.children!
    assert.deepEqual(refs[0]!.presentationalOverrides, {
      title: 'Something went wrong',
      description:
        'An unexpected error occurred. Please retry to reload this page.',
    })
    assert.equal(refs[1]!.presentationalOverrides, undefined)
    assert.deepEqual(contract.warnings, [])
  })

  it('warns on an out-of-vocabulary Title key', () => {
    const { contract } = contractFor(
      vocabPen(fullPageErrorMaster(), [
        refNode('r1', 'fullPageErrorMaster', 'State: Error', {
          descendants: { enRw5: { content: 'x', fill: '$color-bogus' } },
        }),
      ])
    )
    warns(
      contract,
      'FullPageError: unmapped descendant override "enRw5" -> "fill"'
    )
  })
})

describe('REP-1629 Avatar vocabulary (master llVi8)', () => {
  it('maps Name content to name and stays silent', () => {
    const { contract, code } = contractFor(
      vocabPen(avatarMaster(), [
        refNode('r2', 'avatarMaster', 'Avatar 2', {
          descendants: { RWxhn: { content: 'Grace Hopper' } },
        }),
        refNode('r1', 'avatarMaster', 'Avatar 1'),
      ])
    )
    assert.equal(code, 0)
    const refs = contract.screens[0]!.tree.children!
    assert.deepEqual(refs[0]!.presentationalOverrides, {
      name: 'Grace Hopper',
    })
    assert.equal(refs[1]!.presentationalOverrides, undefined)
    assert.deepEqual(contract.warnings, [])
  })

  it('warns on an unknown Avatar descendant key', () => {
    const { contract } = contractFor(
      vocabPen(avatarMaster(), [
        refNode('r1', 'avatarMaster', 'Avatar', {
          descendants: { RWxhn: { content: 'x', rotation: 90 } },
        }),
      ])
    )
    warns(
      contract,
      'Avatar: unmapped descendant override "RWxhn" -> "rotation"'
    )
  })
})

describe('REP-1629 AvatarStackSummary vocabulary (master GAQhh)', () => {
  it('maps Label content to label, absorbing fill/fontWeight', () => {
    const { contract, code } = contractFor(
      vocabPen(avatarStackSummaryMaster(), [
        refNode(
          'rOverflow',
          'avatarStackSummaryMaster',
          'AvatarStack (overflow)',
          {
            descendants: {
              iHoIK: { content: 'and 2 more', fontWeight: '400' },
            },
          }
        ),
        refNode('rLinked', 'avatarStackSummaryMaster', 'AvatarStack (linked)', {
          descendants: {
            iHoIK: { content: '5 users', fill: '$color-primary' },
          },
        }),
        refNode('rDefault', 'avatarStackSummaryMaster', 'AvatarStack default'),
      ])
    )
    assert.equal(code, 0)
    const refs = contract.screens[0]!.tree.children!
    assert.deepEqual(refs[0]!.presentationalOverrides, {
      label: 'and 2 more',
    })
    assert.deepEqual(refs[1]!.presentationalOverrides, { label: '5 users' })
    assert.equal(refs[2]!.presentationalOverrides, undefined)
    assert.deepEqual(contract.warnings, [])
  })
})

describe('REP-1629 Badge vocabulary (master d2CvF)', () => {
  it('maps own fill token to context and Label content to children', () => {
    const { contract, code } = contractFor(
      vocabPen(badgeMaster(), [
        refNode('rInfo', 'badgeMaster', 'Info', {
          fill: '$color-info-subtle',
          stroke: '$color-info-border-subtle',
          descendants: { nNYA6: { content: 'Info', fill: '$color-info-fg' } },
        }),
        refNode('rDanger', 'badgeMaster', 'Danger', {
          fill: '$color-danger-subtle',
          stroke: '$color-danger-border-subtle',
          descendants: {
            nNYA6: { content: 'Danger', fill: '$color-danger-fg' },
          },
        }),
        refNode('rDefault', 'badgeMaster', 'Badge default'),
      ])
    )
    assert.equal(code, 0)
    const refs = contract.screens[0]!.tree.children!
    assert.deepEqual(refs[0]!.presentationalOverrides, {
      context: 'info',
      children: 'Info',
    })
    assert.deepEqual(refs[1]!.presentationalOverrides, {
      context: 'danger',
      children: 'Danger',
    })
    assert.equal(refs[2]!.presentationalOverrides, undefined)
    assert.deepEqual(contract.warnings, [])
  })

  it('warns on an unrecognized Badge fill token', () => {
    const { contract } = contractFor(
      vocabPen(badgeMaster(), [
        refNode('r1', 'badgeMaster', 'Badge', {
          fill: '$color-bogus',
          descendants: { nNYA6: { content: 'x' } },
        }),
      ])
    )
    warns(contract, 'Badge: unmapped override "fill"')
  })
})

describe('REP-1629 Input vocabulary (master KnDBg)', () => {
  it('maps own stroke danger to context and Placeholder content to value', () => {
    const { contract, code } = contractFor(
      vocabPen(inputMaster(), [
        refNode('rError', 'inputMaster', 'Error', {
          stroke: '$color-danger',
          descendants: {
            inputPlaceholder: {
              content: 'not-an-email',
              fill: '$color-text-default',
            },
          },
        }),
        refNode('rValue', 'inputMaster', 'With Value', {
          descendants: { inputPlaceholder: { content: 'repro.dev' } },
        }),
        refNode('rDefault', 'inputMaster', 'Default'),
      ])
    )
    assert.equal(code, 0)
    const refs = contract.screens[0]!.tree.children!
    assert.deepEqual(refs[0]!.presentationalOverrides, {
      context: 'error',
      value: 'not-an-email',
    })
    assert.deepEqual(refs[1]!.presentationalOverrides, { value: 'repro.dev' })
    assert.equal(refs[2]!.presentationalOverrides, undefined)
    assert.deepEqual(contract.warnings, [])
  })

  it('warns on an unrecognized Input stroke value', () => {
    const { contract } = contractFor(
      vocabPen(inputMaster(), [
        refNode('r1', 'inputMaster', 'Input', {
          stroke: '$color-bogus',
        }),
      ])
    )
    warns(contract, 'Input: unmapped override "stroke"')
  })
})

describe('REP-1629 warn-never-drop on absorbed override branches', () => {
  it('warns on unmapped fill riding on Checkbox Check enabled=true', () => {
    const { contract } = contractFor(
      vocabPen(checkboxMaster(), [
        refNode('r1', 'checkboxMaster', 'Checkbox', {
          descendants: { p2muX: { enabled: true, fill: '$color-danger' } },
        }),
      ])
    )
    warns(contract, 'Checkbox: unmapped descendant override "p2muX" -> "fill"')
    assert.deepEqual(
      contract.screens[0]!.tree.children![0]!.presentationalOverrides,
      { checked: true }
    )
  })

  it('warns on unmapped opacity riding on Stack Child 2 enabled=false', () => {
    const { contract } = contractFor(
      vocabPen(stackMaster(), [
        refNode('r1', 'stackMaster', 'Stack', {
          descendants: { E0ZK6: { enabled: false, opacity: 0.5 } },
        }),
      ])
    )
    warns(contract, 'Stack: unmapped descendant override "E0ZK6" -> "opacity"')
  })

  it('warns on unmapped fill riding on TextField Error enabled=false', () => {
    const { contract } = contractFor(
      vocabPen(textFieldMaster(), [
        refNode('r1', 'textFieldMaster', 'TextField', {
          descendants: { v16Rdg: { enabled: false, fill: '$color-danger' } },
        }),
      ])
    )
    warns(
      contract,
      'TextField: unmapped descendant override "v16Rdg" -> "fill"'
    )
  })

  it('warns on non-string Alert Message content (no silent absorption)', () => {
    const { contract } = contractFor(
      vocabPen(alertMaster(), [
        refNode('r1', 'alertMaster', 'Alert', {
          descendants: { alertMsg: { content: 42 } },
        }),
      ])
    )
    warns(
      contract,
      'Alert: unmapped descendant override "alertMsg" -> "content"'
    )
  })
})
