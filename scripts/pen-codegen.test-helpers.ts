import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import type { RenderContext } from './pen-codegen.ts'
import type { PenFile, PenNode } from './pen-lint.ts'
import { extractMasters, parsePenJson } from './pen-lint.ts'

export const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..'
)
export const tmpDir = path.join(repoRoot, 'tmp')

export const frame = (
  id: string,
  name: string,
  extra: Record<string, unknown> = {}
): PenNode => ({ type: 'frame', id, name, ...extra })

export const textNode = (
  id: string,
  name: string,
  content: string
): PenNode => ({
  type: 'text',
  id,
  name,
  content,
})

export const refNode = (
  id: string,
  ref: string,
  name: string,
  extra: Record<string, unknown> = {}
): PenNode => ({ type: 'ref', id, ref, name, ...extra })

/** Synthetic exports map so unit tests are hermetic (no repo scan). */
export function syntheticExports(): Map<string, Set<string>> {
  return new Map([
    ['design', new Set(['Button', 'Input', 'Toggle', 'EmptyState'])],
    ['agentic-ui', new Set(['EmptyState'])],
  ])
}

export function makeCtx(pen: PenFile): RenderContext {
  const masterNodeById = new Map<string, PenNode>()
  for (const master of extractMasters(pen)) {
    const node = pen.children.find(child => child.id === master.id)
    if (node) masterNodeById.set(master.id, node)
  }
  return {
    masterNodeById,
    exportsByPackage: syntheticExports(),
    violations: [],
    warnings: [],
    designImports: new Set(),
    jsxstyleImports: new Set(),
    screenId: 's1',
    screenName: 'Demo',
  }
}

export function fixturePen(): PenFile {
  return parsePenJson(
    JSON.stringify({
      version: '2.14',
      children: [
        frame('btnMaster', 'design::Button', {
          reusable: true,
          height: 36,
          fill: '$color-info',
          children: [textNode('btnLabel', 'Label', 'Label')],
        }),
        frame('inputMaster', 'design::Input', {
          reusable: true,
          height: 36,
          children: [
            textNode('inputPlaceholder', 'Placeholder', 'Placeholder'),
          ],
        }),
        frame('unknownMaster', 'Foo', { reusable: true, height: 20 }),
        frame('s1', 'Screen: Demo', {
          width: 400,
          children: [
            refNode('r1', 'btnMaster', 'Save', {
              descendants: { btnLabel: { content: 'Save changes' } },
            }),
            refNode('r2', 'inputMaster', 'Email', {
              width: 300,
              descendants: { inputPlaceholder: { content: 'you@example.com' } },
            }),
            refNode('r3', 'unknownMaster', 'Foo'),
          ],
        }),
      ],
      variables: {
        'color-info': { type: 'color', value: [] },
        'spacing-md': { type: 'number', value: 8 },
      },
    })
  )
}

/** Clean fixture — every master resolves, used for exit-0 CLI tests. */
export function cleanFixturePen(): PenFile {
  return parsePenJson(
    JSON.stringify({
      version: '2.14',
      children: [
        frame('btnMaster', 'design::Button', {
          reusable: true,
          children: [textNode('btnLabel', 'Label', 'Label')],
        }),
        frame('s1', 'Screen: Demo', {
          children: [
            refNode('r1', 'btnMaster', 'Save', {
              descendants: { btnLabel: { content: 'Save changes' } },
            }),
          ],
        }),
      ],
      variables: {},
    })
  )
}

export function writeFixturePen(): string {
  const penFile = path.join(tmpDir, 'pen-codegen-fixture.pen')
  mkdirSync(tmpDir, { recursive: true })
  writeFileSync(penFile, JSON.stringify(fixturePen(), null, 2) + '\n')
  return penFile
}

export function writeCleanFixturePen(): string {
  const penFile = path.join(tmpDir, 'pen-codegen-clean-fixture.pen')
  mkdirSync(tmpDir, { recursive: true })
  writeFileSync(penFile, JSON.stringify(cleanFixturePen(), null, 2) + '\n')
  return penFile
}
