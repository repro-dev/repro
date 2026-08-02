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

describe('REP-1620 pen-lint export mode (pen CLI required, skipped otherwise)', () => {
  it('exports PNG + HTML and regenerates the screens index', async t => {
    const dir = mkdtempSync(path.join(tmpdir(), 'pen-lint-export-'))
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

      // pen CLI must be installed AND authenticated — a bare --help probe is
      // insufficient because CI installs pen without PEN_CLI_KEY, which makes
      // export_nodes fail with "Authentication required". Probe with a real
      // interactive session on the fixture so the skip matches what runExport
      // actually needs.
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
