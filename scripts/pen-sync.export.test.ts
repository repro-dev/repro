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

import { runExport } from './pen-sync.ts'

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

describe('REP-1620 pen-sync export mode (pen CLI required, skipped otherwise)', () => {
  it('exports PNG + HTML and regenerates the screens index', async t => {
    // pen CLI unavailable (no auth / not installed) — skip the test.
    const probe = spawnSync('pen', ['--help'], { encoding: 'utf8' })
    if (probe.error || probe.status !== 0) {
      t.skip('pen CLI unavailable')
      return
    }
    const dir = mkdtempSync(path.join(tmpdir(), 'pen-sync-export-'))
    try {
      const penFile = path.join(dir, 'fixture.pen')
      const componentMapFile = path.join(dir, 'component-map.json')
      const exportDir = path.join(dir, 'screens')
      writeFileSync(
        penFile,
        JSON.stringify({
          version: '2.14',
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
          variables: { 'font-sans': { type: 'string', value: 'Inter' } },
        })
      )
      writeFileSync(
        componentMapFile,
        JSON.stringify({ components: {}, noMaster: [], screens: { Old: 'x1' } })
      )

      const logs: string[] = []
      const code = await runExport({
        penFile,
        componentMapFile,
        exportDir,
        log: msg => logs.push(msg),
      })
      assert.equal(code, 0, logs.join('\n'))
      assert.equal(existsSync(path.join(exportDir, 'f1.png')), true)
      assert.equal(existsSync(path.join(exportDir, 'screen-mini.html')), true)
      const componentMap = JSON.parse(
        readFileSync(componentMapFile, 'utf8')
      ) as { screens: Record<string, string> }
      assert.deepEqual(componentMap.screens, { Mini: 'f1' })
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
