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
      new Set([
        'Button',
        'Alert',
        'Input',
        'Toggle',
        'EmptyState',
        'AppShell',
        'Checkbox',
        'Stack',
        'TextField',
        'FullPageError',
        'Avatar',
        'AvatarStackSummary',
        'Badge',
      ]),
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

/** Checkbox master (mirrors repro.pen master dDpF6: Box/Check/Label). */
export function checkboxMaster(id = 'checkboxMaster'): PenNode {
  return frame(id, 'Checkbox', {
    reusable: true,
    gap: '$spacing-md',
    metadata: { type: 'master', package: 'design', component: 'Checkbox' },
    children: [
      frame('sa63x', 'Box', {
        width: 16,
        height: 16,
        fill: '$color-bg-surface',
        cornerRadius: '$radius-sm',
        stroke: '$color-border-strong',
        strokeWidth: 1,
        strokeAlignment: 'inner',
        justifyContent: 'center',
        alignItems: 'center',
        children: [
          {
            type: 'icon',
            id: 'p2muX',
            x: 0,
            y: 0,
            name: 'Check',
            enabled: false,
            width: 12,
            height: 12,
            icon: 'check',
            library: 'lucide',
            fill: '$color-text-inverse',
          },
        ],
      }),
      textNode('AXIyz', 'Label', 'Checkbox'),
    ],
  })
}

/** Stack master (mirrors repro.pen master oj0de: Child 1/2/3). */
export function stackMaster(id = 'stackMaster'): PenNode {
  return frame(id, 'Stack', {
    reusable: true,
    width: 200,
    layout: 'vertical',
    gap: '$spacing-md',
    metadata: { type: 'master', package: 'design', component: 'Stack' },
    children: [
      frame('Vx0bQ', 'Child 1', {
        width: 'fill_container',
        height: 40,
        fill: '$color-bg-hover',
        cornerRadius: '$radius-sm',
        justifyContent: 'center',
        alignItems: 'center',
      }),
      frame('E0ZK6', 'Child 2', {
        width: 'fill_container',
        height: 40,
        fill: '$color-bg-hover',
        cornerRadius: '$radius-sm',
        justifyContent: 'center',
        alignItems: 'center',
      }),
      frame('D6MKAC', 'Child 3', {
        width: 'fill_container',
        height: 40,
        fill: '$color-bg-hover',
        cornerRadius: '$radius-sm',
        justifyContent: 'center',
        alignItems: 'center',
      }),
    ],
  })
}

/** TextField master (mirrors repro.pen master Q6CWT: Label/Input/Error). */
export function textFieldMaster(id = 'textFieldMaster'): PenNode {
  return frame(id, 'TextField', {
    reusable: true,
    width: 280,
    layout: 'vertical',
    gap: '$spacing-md',
    metadata: { type: 'master', package: 'design', component: 'TextField' },
    children: [
      textNode('WGsF1', 'Label', 'Email'),
      frame('Mtldk', 'Input', {
        width: 280,
        height: 36,
        fill: '$color-bg-surface',
        cornerRadius: '$radius-sm',
        stroke: '$color-border-strong',
        strokeWidth: 1,
        strokeAlignment: 'inner',
        padding: [0, '$spacing-lg'],
        alignItems: 'center',
        children: [textNode('k7Szg', 'Value', 'not-an-email')],
      }),
      textNode('v16Rdg', 'Error', 'Enter a valid email address.'),
    ],
  })
}

/** Toggle master (mirrors repro.pen master OMduR: Track/Knob/Label). */
export function toggleMaster(id = 'toggleMaster'): PenNode {
  return frame(id, 'Toggle', {
    reusable: true,
    gap: '$spacing-sm',
    alignItems: 'center',
    metadata: { type: 'master', package: 'design', component: 'Toggle' },
    children: [
      frame('d6Q9W', 'Track', {
        width: 32,
        height: 20,
        fill: '$color-bg-strong',
        cornerRadius: '$radius-full',
        stroke: '$color-border-emphasis',
        strokeWidth: 1,
        strokeAlignment: 'inner',
        layout: 'none',
        children: [
          {
            type: 'ellipse',
            id: 'VYbf2',
            x: 2,
            y: 3,
            name: 'Knob',
            fill: '$color-border-emphasis',
            width: 14,
            height: 14,
          },
        ],
      }),
      textNode('VZBQ5', 'Label', 'Toggle'),
    ],
  })
}

/** FullPageError master (mirrors repro.pen master HkYOE: Title/Description). */
export function fullPageErrorMaster(id = 'fullPageErrorMaster'): PenNode {
  return frame(id, 'FullPageError', {
    reusable: true,
    width: 360,
    height: 280,
    fill: '$color-bg-surface',
    cornerRadius: '$radius-md',
    layout: 'vertical',
    gap: '$spacing-lg',
    padding: '$spacing-2xl',
    justifyContent: 'center',
    alignItems: 'center',
    metadata: { type: 'master', package: 'design', component: 'FullPageError' },
    children: [
      {
        type: 'icon',
        id: 'K2x2z',
        name: 'Icon',
        width: 40,
        height: 40,
        icon: 'warning',
        library: 'Material Symbols Rounded',
        fill: '$color-danger',
      },
      textNode('enRw5', 'Title', 'Something went wrong'),
      textNode('VaehS', 'Description', 'The session failed to load.'),
    ],
  })
}

/** Avatar master (mirrors repro.pen master llVi8: Image/Name). */
export function avatarMaster(id = 'avatarMaster'): PenNode {
  return frame(id, 'Avatar', {
    reusable: true,
    fill: '#00000000',
    gap: '$spacing-md',
    justifyContent: 'center',
    alignItems: 'center',
    metadata: { type: 'master', package: 'design', component: 'Avatar' },
    children: [
      {
        type: 'ellipse',
        id: 'bv8NE',
        name: 'Image',
        fill: '$color-bg-muted',
        width: 30,
        height: 30,
      },
      textNode('RWxhn', 'Name', 'Ada Byron'),
    ],
  })
}

/** AvatarStackSummary master (mirrors repro.pen master GAQhh: Cluster/Label). */
export function avatarStackSummaryMaster(
  id = 'avatarStackSummaryMaster'
): PenNode {
  return frame(id, 'AvatarStackSummary', {
    reusable: true,
    gap: '$spacing-md',
    alignItems: 'center',
    metadata: {
      type: 'master',
      package: 'design',
      component: 'AvatarStackSummary',
    },
    children: [
      frame('AAk9n', 'Avatar Cluster', {
        width: 64,
        height: 24,
        layout: 'none',
        children: [],
      }),
      textNode('iHoIK', 'Label', '3 users'),
    ],
  })
}

/** Badge master (mirrors repro.pen master d2CvF: Label). */
export function badgeMaster(id = 'badgeMaster'): PenNode {
  return frame(id, 'Badge', {
    reusable: true,
    fill: '$color-bg-hover',
    cornerRadius: '$radius-sm',
    stroke: '$color-neutral-border-subtle',
    strokeWidth: 1,
    gap: '$spacing-xs',
    padding: ['$spacing-xs', '$spacing-sm'],
    alignItems: 'center',
    metadata: { type: 'master', package: 'design', component: 'Badge' },
    children: [textNode('nNYA6', 'Label', 'Badge')],
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
