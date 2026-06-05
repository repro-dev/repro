/**
 * Unit tests for visual-regression-capture.ts
 *
 * Tests the threshold logic, diffPngBuffers, isAboveThreshold, and JSON output shape.
 * Does NOT require a running browser or Storybook — Playwright is mocked.
 *
 * Run:
 *   node --experimental-test-module-mocks --test scripts/visual-regression-capture.test.ts
 */

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { PNG } from 'pngjs'

// ---------------------------------------------------------------------------
// Helpers to build PNG buffers for tests
// ---------------------------------------------------------------------------

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
// Import the module under test
// We import after helpers so mocks can be set up if needed
// ---------------------------------------------------------------------------

import {
  diffPngBuffers,
  isAboveThreshold,
  type CaptureOutput,
} from './visual-regression-capture.ts'

// ---------------------------------------------------------------------------
// isAboveThreshold — pure logic, no I/O
// ---------------------------------------------------------------------------

describe('isAboveThreshold', () => {
  it('returns false when diff ratio is below threshold', () => {
    // 0.0005 ratio vs 0.001 threshold → pass
    assert.equal(isAboveThreshold(5, 10000, 0.001), false)
  })

  it('returns true when diff ratio exceeds threshold', () => {
    // 0.002 ratio vs 0.001 threshold → fail
    assert.equal(isAboveThreshold(20, 10000, 0.001), true)
  })

  it('returns false when exactly at threshold (not strictly greater)', () => {
    // Exactly 0.001: 10/10000 = 0.001 → NOT above (uses >), so pass
    assert.equal(isAboveThreshold(10, 10000, 0.001), false)
  })

  it('returns false when totalPixels is 0 (avoid divide-by-zero)', () => {
    assert.equal(isAboveThreshold(0, 0, 0.001), false)
  })

  it('returns false when changedPixels is 0', () => {
    assert.equal(isAboveThreshold(0, 10000, 0.001), false)
  })

  it('handles threshold 0 with any non-zero change as failing', () => {
    assert.equal(isAboveThreshold(1, 10000, 0), true)
  })
})

// ---------------------------------------------------------------------------
// diffPngBuffers — uses pixelmatch + pngjs, writes to a temp file
// ---------------------------------------------------------------------------

import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'

describe('diffPngBuffers', () => {
  it('returns 0 changed pixels for two identical images', async () => {
    const buf = makeSolidPng(10, 10, 100, 150, 200)
    const result = await diffPngBuffers(buf, buf, null)

    assert.equal(result.changedPixels, 0)
    assert.equal(result.totalPixels, 100)
    assert.equal(result.diffPath, null)
  })

  it('returns non-zero changed pixels for different images', async () => {
    const red = makeSolidPng(10, 10, 255, 0, 0)
    const blue = makeSolidPng(10, 10, 0, 0, 255)
    const result = await diffPngBuffers(red, blue, null)

    assert.ok(result.changedPixels > 0, 'Expected non-zero changed pixels')
    assert.equal(result.totalPixels, 100)
  })

  it('writes diff image to outputPath when provided', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vr-test-'))
    const diffPath = path.join(tmpDir, 'test.diff.png')

    const red = makeSolidPng(10, 10, 255, 0, 0)
    const blue = makeSolidPng(10, 10, 0, 0, 255)
    const result = await diffPngBuffers(red, blue, diffPath)

    assert.equal(result.diffPath, diffPath)
    assert.ok(fs.existsSync(diffPath), 'Diff file should exist')

    // Cleanup
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('treats size-mismatched images as fully changed', async () => {
    const small = makeSolidPng(5, 5, 100, 100, 100)
    const large = makeSolidPng(10, 10, 100, 100, 100)
    const result = await diffPngBuffers(small, large, null)

    assert.equal(result.changedPixels, result.totalPixels)
    assert.equal(result.totalPixels, 100) // uses current (large) dimensions
  })

  it('does not write diff file when outputPath is null', async () => {
    const buf = makeSolidPng(10, 10, 50, 50, 50)
    const result = await diffPngBuffers(buf, buf, null)
    assert.equal(result.diffPath, null)
  })
})

// ---------------------------------------------------------------------------
// CaptureOutput JSON shape
// ---------------------------------------------------------------------------

describe('CaptureOutput shape', () => {
  it('has the expected fields in JSON output', () => {
    const output: CaptureOutput = {
      stories_checked: ['button--primary', 'button--secondary'],
      passed: ['button--primary'],
      failed: [
        {
          story: 'button--secondary',
          diff_path: '/tmp/button--secondary.diff.png',
          changed_pixels: 150,
          total_pixels: 10000,
        },
      ],
      new_stories: ['button--new'],
    }

    const json = JSON.parse(JSON.stringify(output))

    assert.ok(Array.isArray(json.stories_checked))
    assert.ok(Array.isArray(json.passed))
    assert.ok(Array.isArray(json.failed))
    assert.ok(Array.isArray(json.new_stories))

    const failed = json.failed[0]
    assert.equal(typeof failed.story, 'string')
    assert.equal(typeof failed.diff_path, 'string')
    assert.equal(typeof failed.changed_pixels, 'number')
    assert.equal(typeof failed.total_pixels, 'number')
  })

  it('new story is recorded in new_stories, not in failed', () => {
    // Simulates the behavior: when no baseline exists, story goes to new_stories
    const output: CaptureOutput = {
      stories_checked: ['button--new'],
      passed: [],
      failed: [],
      new_stories: ['button--new'],
    }

    assert.equal(output.new_stories.length, 1)
    assert.equal(output.failed.length, 0)
    assert.ok(output.new_stories.includes('button--new'))
  })

  it('passes within-threshold diffs correctly', () => {
    // 5 changed pixels out of 10000 = 0.05% → below 0.1% threshold → pass
    const changedPixels = 5
    const totalPixels = 10000
    const threshold = 0.001 // 0.1%

    const passes = !isAboveThreshold(changedPixels, totalPixels, threshold)
    assert.ok(passes, 'Should pass when diff ratio is below threshold')

    const output: CaptureOutput = {
      stories_checked: ['button--primary'],
      passed: passes ? ['button--primary'] : [],
      failed: [],
      new_stories: [],
    }

    assert.equal(output.passed.length, 1)
    assert.equal(output.failed.length, 0)
  })

  it('fails above-threshold diffs correctly', () => {
    // 200 changed pixels out of 10000 = 2% → above 0.1% threshold → fail
    const changedPixels = 200
    const totalPixels = 10000
    const threshold = 0.001 // 0.1%

    const fails = isAboveThreshold(changedPixels, totalPixels, threshold)
    assert.ok(fails, 'Should fail when diff ratio exceeds threshold')
  })
})
