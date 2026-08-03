import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, it } from 'node:test'

import { runExport } from './pen-lint.ts'

const frame = (
  id: string,
  name: string,
  extra: Record<string, unknown> = {}
) => ({
  type: 'frame',
  id,
  name,
  ...extra,
})

describe('REP-1622 pen-lint export mode (pen CLI required, skipped otherwise)', () => {
  it('finds screens inside groups and exports PNG + HTML', async t => {
    const dir = mkdtempSync(path.join(tmpdir(), 'pen-lint-export-'))
    try {
      const penFile = path.join(dir, 'fixture.pen')
      const catalogOutput = path.join(dir, 'catalog.json')
      const exportDir = path.join(dir, 'screens')
      writeFileSync(
        penFile,
        JSON.stringify({
          version: '2.14',
          children: [
            {
              type: 'group',
              id: 'gS',
              name: 'screens',
              children: [
                {
                  type: 'group',
                  id: 'gDemo',
                  name: 'demo',
                  children: [
                    {
                      type: 'group',
                      id: 'gF',
                      name: 'demo-family',
                      children: [
                        frame('f1', 'Screen: Mini', {
                          width: 200,
                          height: 100,
                          clip: true,
                          fill: '#ffffff',
                          layout: 'vertical',
                          children: [
                            {
                              type: 'text',
                              id: 't1',
                              name: 'Title',
                              content: 'Hello',
                              fontFamily: '$font-sans',
                              fontSize: 16,
                            },
                          ],
                        }),
                      ],
                    },
                  ],
                },
              ],
            },
          ],
          variables: { 'font-sans': { type: 'string', value: 'Inter' } },
        })
      )

      // pen CLI must be installed AND authenticated — probe with a real
      // interactive session on the fixture so the skip matches what
      // runExport actually needs.
      const probe = spawnSync(
        'pen',
        ['interactive', '-i', penFile, '-o', '/dev/null'],
        { encoding: 'utf8', input: 'exit()\n' }
      )
      if (probe.error || probe.status !== 0) {
        t.skip('pen CLI unavailable or not authenticated')
        return
      }

      const logs: string[] = []
      const code = await runExport({
        penFile,
        catalogOutput,
        exportDir,
        log: msg => logs.push(msg),
      })
      assert.equal(code, 0, logs.join('\n'))
      assert.equal(existsSync(path.join(exportDir, 'f1.png')), true)
      assert.equal(existsSync(path.join(exportDir, 'screen-mini.html')), true)
      const catalog = JSON.parse(readFileSync(catalogOutput, 'utf8')) as {
        screensIndex: Record<string, string>
      }
      assert.deepEqual(catalog.screensIndex, { Mini: 'f1' })
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
