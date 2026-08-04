// Shared fixtures for scripts/pen-contract.test.ts (and friends).
import type { PenFile, PenNode } from './pen-lint.ts'
import { parsePenJson } from './pen-lint.ts'

export const frame = (
  id: string,
  name: string,
  extra: Record<string, unknown> = {}
): PenNode => ({ type: 'frame', id, name, ...extra })

export const group = (
  name: string,
  id: string,
  children: PenNode[]
): PenNode => ({ type: 'group', id, name, x: 0, y: 0, children })

export const refNode = (
  id: string,
  ref: string,
  name: string,
  extra: Record<string, unknown> = {}
): PenNode => ({ type: 'ref', id, ref, name, ...extra })

export const textNode = (
  id: string,
  name: string,
  content: string
): PenNode => ({ type: 'text', id, name, content })

/** Synthetic exports map so unit tests are hermetic (no repo scan). */
export function syntheticExports(): Map<string, Set<string>> {
  return new Map([
    [
      'design',
      new Set(['Button', 'Alert', 'Input', 'Toggle', 'EmptyState', 'AppShell']),
    ],
    ['agentic-ui', new Set(['EmptyState'])],
  ])
}

export function buttonMaster(id = 'btnMaster'): PenNode {
  return frame(id, 'Button', {
    reusable: true,
    height: 36,
    fill: '$color-info',
    metadata: { type: 'master', package: 'design', component: 'Button' },
    children: [textNode('btnLabel', 'Label', 'Button')],
  })
}

export function alertMaster(id = 'alertMaster'): PenNode {
  return frame(id, 'Alert', {
    reusable: true,
    width: 480,
    fill: '$color-info-tint',
    stroke: '$color-info-border-subtle',
    metadata: { type: 'master', package: 'design', component: 'Alert' },
    children: [
      { type: 'icon', id: 'alertIcon', name: 'Icon' },
      textNode('alertMsg', 'Message', 'This is an informational alert.'),
    ],
  })
}

export function inputMaster(id = 'inputMaster'): PenNode {
  return frame(id, 'Input', {
    reusable: true,
    height: 36,
    metadata: { type: 'master', package: 'design', component: 'Input' },
    children: [textNode('inputPlaceholder', 'Placeholder', 'Placeholder')],
  })
}

export function mastersGroup(...masters: PenNode[]): PenNode {
  return group('masters', 'gMasters', [group('design', 'gDesign', masters)])
}

/**
 * screens/<surface>/<family> group tree; each screen entry is
 * [id, name, metadata?, children?].
 */
export function screenFamilyGroup(
  surface: string,
  family: string,
  screens: PenNode[]
): PenNode {
  return group('screens', 'gScreens', [
    group(surface, `g${surface}`, [
      group(family, `g${surface}-${family}`, screens),
    ]),
  ])
}

export function screenNode(
  id: string,
  name: string,
  stateFamily: string,
  state: string,
  children: PenNode[] = []
): PenNode {
  return frame(id, name, {
    width: 400,
    height: 300,
    children,
    metadata: { type: 'screen', stateFamily, state },
  })
}

/** One screen with a Button ref that has a label + context override. */
export function contractFixturePen(): PenFile {
  return parsePenJson(
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
            [
              refNode('r1', 'btnMaster', 'Save', {
                fill: '$color-success',
                descendants: { btnLabel: { content: 'Save changes' } },
              }),
            ]
          ),
        ]),
      ],
      variables: {},
    })
  )
}

/** A full health state family (content + empty + loading + error). */
export function healthFamilyFixturePen(): PenFile {
  return parsePenJson(
    JSON.stringify({
      version: '2.14',
      children: [
        mastersGroup(buttonMaster()),
        group('screens', 'gScreens', [
          group('admin', 'gAdmin', [
            group('health', 'gAdmin-health', [
              screenNode(
                'sContent',
                'Admin: Health',
                'screens/admin/health',
                'content'
              ),
              screenNode(
                'sEmpty',
                'Admin: State: Empty',
                'screens/admin/health',
                'empty'
              ),
              screenNode(
                'sLoading',
                'Admin: State: Loading',
                'screens/admin/health',
                'loading'
              ),
              screenNode(
                'sError',
                'Admin: State: Error',
                'screens/admin/health',
                'error'
              ),
            ]),
          ]),
        ]),
      ],
      variables: {},
    })
  )
}
