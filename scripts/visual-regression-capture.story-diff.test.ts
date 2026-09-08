/**
 * Unit tests for visual-regression-capture.ts — threshold validation and
 * per-story baseline diffing (REP-1648 review fix 3):
 *
 * - `parseThreshold` must reject non-finite/out-of-range input with an
 *   actionable error: NaN or >1 would make every diff pass (false green),
 *   negatives would make every diff fail;
 * - `diffStoryAgainstBaseline` must record corrupt/unreadable baseline or
 *   current PNGs through recordCaptureError and continue — the exit code
 *   stays honest instead of the run crashing with an unstructured error.
 *
 * No browser and no Storybook — the diff path is exercised directly with
 * real pngjs/pixelmatch buffers.
 *
 * Run:
 *   node --test scripts/visual-regression-capture.story-diff.test.ts
 */

import * as fs from 'fs'
import assert from 'node:assert/strict'
import { after, describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'
import * as path from 'path'
import { PNG } from 'pngjs'

import {
  computeExitCode,
  diffStoryAgainstBaseline,
  parseThreshold,
  type CaptureOutput,
  type StoryDiffPaths,
} from './visual-regression-capture.ts'

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..'
)

const scratchDirs: string[] = []

/**
 * Scratch dir under the repo-root tmp/ (AGENTS.md invariant — never /tmp).
 * Registered for the after() sweep so a failed assertion cannot leak it;
 * each test still removes its own dir on the happy path.
 */
function makeScratchDir(prefix: string): string {
  const dir = fs.mkdtempSync(
    path.join(repoRoot, 'tmp', `${prefix}-${process.pid}-`)
  )
  scratchDirs.push(dir)
  return dir
}

after(() => {
  for (const dir of scratchDirs) {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

function makeSolidPng(
  width: number,
  height: number,
  r: number,
  g: number,
  b: number
): Buffer {
  const png = new PNG({ width, height })
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (width * y + x) * 4
      png.data[idx] = r
      png.data[idx + 1] = g
      png.data[idx + 2] = b
      png.data[idx + 3] = 255
    }
  }
  return PNG.sync.write(png)
}

// ---------------------------------------------------------------------------
// Threshold validation (review fix 3): an invalid --threshold must fail
// non-zero with an actionable error — NaN/1.5 would make every diff pass,
// negatives would make every diff fail.
// ---------------------------------------------------------------------------

describe('parseThreshold', () => {
  it('accepts finite fraction strings in [0, 1]', () => {
    assert.equal(parseThreshold('0'), 0)
    assert.equal(parseThreshold('0.001'), 0.001)
    assert.equal(parseThreshold('.5'), 0.5)
    assert.equal(parseThreshold('0.5 '), 0.5)
    assert.equal(parseThreshold('1'), 1)
    assert.equal(parseThreshold('1.0'), 1)
    assert.equal(parseThreshold('1e-3'), 0.001)
  })

  it('rejects non-numeric input with an actionable message', () => {
    for (const invalid of ['abc', 'NaN', '', '   ']) {
      assert.throws(
        () => parseThreshold(invalid),
        /must be a finite number between 0 and 1/,
        `expected "${invalid}" to be rejected with an actionable message`
      )
    }
  })

  it('rejects values outside [0, 1]', () => {
    for (const invalid of ['-0.1', '1.5', '100', 'Infinity', '-Infinity']) {
      assert.throws(
        () => parseThreshold(invalid),
        /must be a finite number between 0 and 1/,
        `expected "${invalid}" to be rejected`
      )
    }
  })

  it('names the offending value in the error', () => {
    assert.throws(() => parseThreshold('banana'), /"banana"/)
  })
})

// ---------------------------------------------------------------------------
// Per-story diff against the baseline (review fix 3): corrupt or unreadable
// baseline/current PNGs must be recorded through recordCaptureError and the
// run must continue — never an unstructured crash.
// ---------------------------------------------------------------------------

describe('diffStoryAgainstBaseline', () => {
  function makePaths(
    tmpDir: string,
    files: { baseline?: Buffer; screenshot?: Buffer }
  ): StoryDiffPaths {
    const paths: StoryDiffPaths = {
      baselinePath: path.join(tmpDir, 'story--primary.png'),
      screenshotPath: path.join(tmpDir, 'story--primary.current.png'),
      diffOutputPath: path.join(tmpDir, 'story--primary.diff.png'),
    }

    if (files.baseline !== undefined) {
      fs.writeFileSync(paths.baselinePath, files.baseline)
    }
    if (files.screenshot !== undefined) {
      fs.writeFileSync(paths.screenshotPath, files.screenshot)
    }

    return paths
  }

  function freshOutput(storyId = 'story--primary'): CaptureOutput {
    return {
      stories_checked: [storyId],
      passed: [],
      failed: [],
      new_stories: [],
    }
  }

  it('records passed for a within-threshold pair', async () => {
    const tmpDir = makeScratchDir('vr-diff')
    const buffer = makeSolidPng(10, 10, 100, 150, 200)
    const paths = makePaths(tmpDir, { baseline: buffer, screenshot: buffer })

    const output = freshOutput()
    await diffStoryAgainstBaseline(output, 'story--primary', paths, 0.001)

    assert.deepEqual(output.passed, ['story--primary'])
    assert.equal(output.failed.length, 0)

    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('records a failure without error text for an above-threshold pair', async () => {
    const tmpDir = makeScratchDir('vr-diff')
    const paths = makePaths(tmpDir, {
      baseline: makeSolidPng(10, 10, 255, 0, 0),
      screenshot: makeSolidPng(10, 10, 0, 0, 255),
    })

    const output = freshOutput()
    await diffStoryAgainstBaseline(output, 'story--primary', paths, 0.001)

    assert.equal(output.failed.length, 1)
    assert.equal(output.failed[0]!.story, 'story--primary')
    assert.equal(output.failed[0]!.error, undefined)
    assert.equal(output.failed[0]!.diff_path, paths.diffOutputPath)

    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('keeps the dimension-mismatch placeholder behavior', async () => {
    const tmpDir = makeScratchDir('vr-diff')
    const paths = makePaths(tmpDir, {
      baseline: makeSolidPng(5, 5, 100, 100, 100),
      screenshot: makeSolidPng(10, 10, 100, 100, 100),
    })

    const output = freshOutput()
    await diffStoryAgainstBaseline(output, 'story--primary', paths, 0.001)

    assert.equal(output.failed.length, 1)
    const failed = output.failed[0]!
    assert.match(failed.error!, /dimensions differ/)
    assert.equal(failed.diff_path, paths.diffOutputPath)
    assert.ok(fs.existsSync(paths.diffOutputPath), 'placeholder diff exists')

    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('records a capture error for a corrupt baseline PNG instead of crashing', async () => {
    const tmpDir = makeScratchDir('vr-diff')
    const paths = makePaths(tmpDir, {
      baseline: Buffer.from('this is not a png'),
      screenshot: makeSolidPng(10, 10, 100, 150, 200),
    })

    const output = freshOutput()
    await diffStoryAgainstBaseline(output, 'story--primary', paths, 0.001)

    // The story was checked, so it must land in failed with an actionable
    // error — never in passed/new_stories, and never an unstructured crash.
    assert.equal(output.failed.length, 1)
    const failed = output.failed[0]!
    assert.equal(failed.story, 'story--primary')
    assert.match(
      failed.error!,
      /could not diff against the committed baseline/,
      'the error must be actionable, not a raw pngjs crash'
    )
    assert.equal(failed.diff_path, null)
    assert.deepEqual(output.passed, [])
    assert.deepEqual(output.new_stories, [])
    assert.equal(computeExitCode(output, false), 1)

    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('records a capture error for a corrupt current screenshot', async () => {
    const tmpDir = makeScratchDir('vr-diff')
    const paths = makePaths(tmpDir, {
      baseline: makeSolidPng(10, 10, 100, 150, 200),
      screenshot: Buffer.from('truncated'),
    })

    const output = freshOutput()
    await diffStoryAgainstBaseline(output, 'story--primary', paths, 0.001)

    assert.equal(output.failed.length, 1)
    assert.match(output.failed[0]!.error!, /could not diff against/)

    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('records a capture error when the baseline file is unreadable', async () => {
    const tmpDir = makeScratchDir('vr-diff')
    const paths = makePaths(tmpDir, {
      screenshot: makeSolidPng(10, 10, 100, 150, 200),
    })

    const output = freshOutput()
    await diffStoryAgainstBaseline(output, 'story--primary', paths, 0.001)

    assert.equal(output.failed.length, 1)
    assert.match(output.failed[0]!.error!, /could not read PNG/)
    assert.match(output.failed[0]!.error!, /baseline/)

    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('records a capture error when the captured screenshot is missing', async () => {
    const tmpDir = makeScratchDir('vr-diff')
    const paths = makePaths(tmpDir, {
      baseline: makeSolidPng(10, 10, 100, 150, 200),
    })

    const output = freshOutput()
    await diffStoryAgainstBaseline(output, 'story--primary', paths, 0.001)

    assert.equal(output.failed.length, 1)
    assert.match(output.failed[0]!.error!, /could not read PNG/)

    fs.rmSync(tmpDir, { recursive: true, force: true })
  })
})
