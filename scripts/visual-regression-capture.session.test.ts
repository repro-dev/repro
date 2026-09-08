/**
 * Unit tests for visual-regression-capture.ts — story-page lifecycle and
 * browser-recovery behavior (REP-1648, CI run 34272890081 follow-up):
 *
 * - every story is captured on a FRESH page opened from a reusable session,
 *   closed in `finally`, so one story's page failure cannot poison later
 *   stories (the incident: one dead shared page cascaded
 *   "Target page, context or browser has been closed" onto ~320 stories);
 * - a story-level capture failure is recorded and the run continues;
 * - a mid-run session death recovers through a BOUNDED relaunch budget
 *   (default 2 relaunches after the initial launch); the story that
 *   coincided with the death is retried once on the recovered session;
 * - budget exhaustion is terminal and fails closed: the current story and
 *   every remaining one are recorded as failures with a clear message —
 *   never a silent green;
 * - bucket accounting stays total (every checked story lands in exactly one
 *   of passed / failed / new_stories) and the update-focused path
 *   (baselineDir null → new_stories) is preserved;
 * - the session is closed on both normal and terminal paths.
 *
 * Deterministic: fake sessions/pages are injected through the `openSession`
 * seam — no real browser, no network, no module mocking. The real Playwright
 * adapter is exercised against a minimal fake chromium.
 *
 * Run (also part of pnpm run test:tooling-config):
 *   node --test scripts/visual-regression-capture.session.test.ts
 */

import * as fs from 'fs'
import assert from 'node:assert/strict'
import { after, describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'
import * as path from 'path'
import { PNG } from 'pngjs'

import {
  DEFAULT_MAX_BROWSER_RELAUNCHES,
  captureStories,
  captureStory,
  computeExitCode,
  createPlaywrightSessionFactory,
  type CaptureStoriesOptions,
  type PlaywrightChromiumLike,
  type StoryCapturePage,
  type StoryCaptureSessionFactory,
} from './visual-regression-capture.ts'

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..'
)

const scratchDirs: string[] = []

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

function makeSolidPng(r: number, g: number, b: number): Buffer {
  const png = new PNG({ width: 10, height: 10 })
  for (let y = 0; y < 10; y++) {
    for (let x = 0; x < 10; x++) {
      const idx = (10 * y + x) * 4
      png.data[idx] = r
      png.data[idx + 1] = g
      png.data[idx + 2] = b
      png.data[idx + 3] = 255
    }
  }
  return PNG.sync.write(png)
}

// ---------------------------------------------------------------------------
// Fake page / session / factory — the `openSession` seam under test
// ---------------------------------------------------------------------------

interface FakePageCall {
  method: string
  args: unknown[]
}

interface FakePageRecord {
  page: StoryCapturePage
  calls: FakePageCall[]
  closeCalls: number
}

interface FakePageSpec {
  failGotoWith?: Error
  onGotoFailure?: () => void
}

/** Typed accessor for a recorded fake-page call argument. */
function arg<T>(call: FakePageCall | undefined, index: number): T | undefined {
  return call?.args[index] as T | undefined
}

function makeFakePage(spec: FakePageSpec = {}): FakePageRecord {
  const record: FakePageRecord = {
    page: null as never,
    calls: [],
    closeCalls: 0,
  }
  record.page = {
    async goto(url, options) {
      record.calls.push({ method: 'goto', args: [url, options] })
      if (spec.failGotoWith) {
        spec.onGotoFailure?.()
        throw spec.failGotoWith
      }
    },
    async addStyleTag(options) {
      record.calls.push({ method: 'addStyleTag', args: [options] })
    },
    async waitForSelector(selector, options) {
      record.calls.push({
        method: 'waitForSelector',
        args: [selector, options],
      })
    },
    async waitForTimeout(timeout) {
      record.calls.push({ method: 'waitForTimeout', args: [timeout] })
    },
    async screenshot(options) {
      record.calls.push({ method: 'screenshot', args: [options] })
      fs.mkdirSync(path.dirname(options.path), { recursive: true })
      fs.writeFileSync(options.path, makeSolidPng(255, 0, 0))
    },
    async close() {
      record.closeCalls += 1
    },
  }
  return record
}

interface FakeSessionSpec {
  usable?: () => boolean
  openPageError?: Error
  pageSpec?: (pageIndex: number) => FakePageSpec
}

interface FakeSessionRecord {
  session: import('./visual-regression-capture.ts').StoryCaptureSession
  openPageCalls: number
  closeCalls: number
  pages: FakePageRecord[]
}

function makeFakeSession(spec: FakeSessionSpec = {}): FakeSessionRecord {
  const record: FakeSessionRecord = {
    session: null as never,
    openPageCalls: 0,
    closeCalls: 0,
    pages: [],
  }
  record.session = {
    async openPage() {
      record.openPageCalls += 1
      if (spec.openPageError) throw spec.openPageError
      const page = makeFakePage(spec.pageSpec?.(record.pages.length))
      record.pages.push(page)
      return page.page
    },
    isUsable: () => (spec.usable ? spec.usable() : true),
    async close() {
      record.closeCalls += 1
    },
  }
  return record
}

function makeFakeSessionFactory(
  specFor: (sessionIndex: number) => FakeSessionSpec
): {
  factory: StoryCaptureSessionFactory
  sessions: FakeSessionRecord[]
} {
  const sessions: FakeSessionRecord[] = []
  return {
    sessions,
    factory: {
      async open() {
        const session = makeFakeSession(specFor(sessions.length))
        sessions.push(session)
        return session.session
      },
    },
  }
}

function makeOptions(
  overrides: Partial<CaptureStoriesOptions> & {
    openSession: CaptureStoriesOptions['openSession']
  }
): CaptureStoriesOptions {
  return {
    storyIds: [],
    storybookUrl: 'http://localhost:6099',
    outputDir: makeScratchDir('vr-session'),
    baselineDir: null,
    threshold: 0.001,
    ...overrides,
  }
}

const BROWSER_CLOSED = new Error(
  'page.goto: Target page, context or browser has been closed'
)

// ---------------------------------------------------------------------------
// Per-story page lifecycle
// ---------------------------------------------------------------------------

describe('captureStories — per-story page lifecycle', () => {
  it('opens a fresh page per story, closes each exactly once, and reuses one session', async () => {
    const { factory, sessions } = makeFakeSessionFactory(() => ({}))
    const outputDir = makeScratchDir('vr-session-lifecycle')

    const output = await captureStories(
      makeOptions({
        storyIds: ['a--one', 'a--two', 'a--three'],
        openSession: factory.open,
        outputDir,
      })
    )

    assert.equal(sessions.length, 1, 'one healthy session serves the whole run')
    assert.equal(sessions[0]!.openPageCalls, 3, 'one fresh page per story')
    assert.equal(
      sessions[0]!.closeCalls,
      1,
      'the session closes exactly once at the end'
    )
    for (const [index, page] of sessions[0]!.pages.entries()) {
      assert.equal(page.closeCalls, 1, `story page ${index} closed in finally`)
    }

    assert.deepEqual(output.new_stories, ['a--one', 'a--two', 'a--three'])
    assert.deepEqual(output.passed, [])
    assert.equal(computeExitCode(output, false), 0)
  })

  it('records a story-level capture failure without poisoning later stories', async () => {
    const { factory, sessions } = makeFakeSessionFactory(() => ({
      pageSpec: pageIndex =>
        pageIndex === 0
          ? {
              failGotoWith: new Error(
                'Timeout 10000ms exceeded waiting for networkidle'
              ),
            }
          : {},
    }))

    const output = await captureStories(
      makeOptions({
        storyIds: ['a--broken', 'a--healthy'],
        openSession: factory.open,
      })
    )

    assert.equal(output.failed.length, 1)
    assert.equal(output.failed[0]!.story, 'a--broken')
    assert.match(output.failed[0]!.error!, /Timeout 10000ms exceeded/)
    assert.deepEqual(
      output.new_stories,
      ['a--healthy'],
      'the next story must still be captured'
    )
    assert.equal(computeExitCode(output, false), 1)
    assert.equal(sessions.length, 1, 'a page-level failure must not relaunch')
    for (const page of sessions[0]!.pages) {
      assert.equal(page.closeCalls, 1, 'failed page is closed in finally too')
    }
  })

  it('keeps the capture contract: iframe URL, animation disable, root wait, full-page screenshot', async () => {
    const outputDir = makeScratchDir('vr-session-contract')
    const outputPath = path.join(outputDir, 'button--primary.png')

    const record = makeFakePage()
    await captureStory(
      record.page,
      'http://localhost:6099',
      'button--primary',
      outputPath
    )

    const goto = record.calls.find(call => call.method === 'goto')
    assert.equal(
      arg<string>(goto, 0),
      'http://localhost:6099/iframe.html?id=button--primary&viewMode=story'
    )
    assert.deepEqual(arg<{ waitUntil: string }>(goto, 1), {
      waitUntil: 'networkidle',
    })

    const style = record.calls.find(call => call.method === 'addStyleTag')
    assert.match(
      String(arg<{ content: string }>(style, 0)?.content),
      /animation: none/
    )

    const wait = record.calls.find(call => call.method === 'waitForSelector')
    assert.equal(arg<string>(wait, 0), '#storybook-root:not(:empty)')
    assert.deepEqual(arg<{ timeout: number }>(wait, 1), { timeout: 10000 })

    const settle = record.calls.find(call => call.method === 'waitForTimeout')
    assert.equal(arg<number>(settle, 0), 500)

    const shot = record.calls.find(call => call.method === 'screenshot')
    assert.deepEqual(arg<{ path: string; fullPage?: boolean }>(shot, 0), {
      path: outputPath,
      fullPage: true,
    })
    assert.ok(fs.existsSync(outputPath), 'screenshot lands at the story path')
  })
})

// ---------------------------------------------------------------------------
// Browser recovery
// ---------------------------------------------------------------------------

describe('captureStories — browser recovery', () => {
  it('retries the story that coincided with a session death on a relaunched session', async () => {
    let sessionUsable = true
    const { factory, sessions } = makeFakeSessionFactory(index =>
      index === 0
        ? {
            usable: () => sessionUsable,
            pageSpec: () => ({
              failGotoWith: BROWSER_CLOSED,
              onGotoFailure: () => {
                sessionUsable = false
              },
            }),
          }
        : {}
    )
    const logs: string[] = []

    const output = await captureStories(
      makeOptions({
        storyIds: ['a--executing', 'a--next'],
        openSession: factory.open,
        maxRelaunches: DEFAULT_MAX_BROWSER_RELAUNCHES,
        log: message => logs.push(message),
      })
    )

    assert.equal(
      sessions.length,
      2,
      'the dead session is relaunched exactly once'
    )
    assert.deepEqual(
      output.new_stories,
      ['a--executing', 'a--next'],
      'the interrupted story is retried and captured on the fresh session'
    )
    assert.equal(output.failed.length, 0)
    assert.equal(computeExitCode(output, false), 0)
    assert.ok(
      logs.some(message => /relaunching/.test(message)),
      'relaunch attempts must be logged for observability'
    )
    assert.ok(
      logs.some(message =>
        /browser died during capture of a--executing; retrying once/.test(
          message
        )
      ),
      'the interrupted-story retry must be logged'
    )
    assert.ok(
      sessions.every(session => session.closeCalls >= 1),
      'no session is left open'
    )
  })

  it('relaunches proactively when the acquired session reports itself unusable', async () => {
    const { factory, sessions } = makeFakeSessionFactory(index =>
      index === 0 ? { usable: () => false } : {}
    )

    const output = await captureStories(
      makeOptions({
        storyIds: ['a--one'],
        openSession: factory.open,
      })
    )

    assert.equal(sessions.length, 2)
    assert.deepEqual(output.new_stories, ['a--one'])
    assert.equal(output.failed.length, 0)
  })

  it('fails closed terminally when the relaunch budget is exhausted (never green)', async () => {
    const { factory, sessions } = makeFakeSessionFactory(() => ({
      openPageError: new Error(
        'Target page, context or browser has been closed'
      ),
      usable: () => false,
    }))

    const output = await captureStories(
      makeOptions({
        storyIds: ['s1', 's2', 's3'],
        openSession: factory.open,
        maxRelaunches: 1,
      })
    )

    // Budget: 1 initial + 1 relaunch. The relaunch cannot open a page either,
    // the interrupted story is retried once (second relaunch is refused), and
    // every remaining story fails closed with the terminal error.
    assert.equal(sessions.length, 2, 'relaunch budget is enforced')
    assert.deepEqual(
      output.failed.map(failure => failure.story),
      ['s1', 's2', 's3'],
      'every checked story lands in failed — none silently skipped'
    )
    assert.match(
      output.failed[2]!.error!,
      /browser recovery exhausted after 1 relaunch/
    )
    assert.match(output.failed[2]!.error!, /failing closed/)
    assert.equal(output.passed.length, 0)
    assert.equal(output.new_stories.length, 0)
    assert.equal(computeExitCode(output, false), 1)
    assert.ok(
      sessions.every(session => session.closeCalls === 1),
      'each dead session was closed, none leaked'
    )
  })

  it('treats maxRelaunches 0 as: any session death is terminal', async () => {
    const { factory, sessions } = makeFakeSessionFactory(() => ({
      usable: () => false,
    }))

    const output = await captureStories(
      makeOptions({
        storyIds: ['a--one', 'a--two'],
        openSession: factory.open,
        maxRelaunches: 0,
      })
    )

    assert.equal(sessions.length, 1, 'no relaunch beyond the initial session')
    assert.deepEqual(
      output.failed.map(failure => failure.story),
      ['a--one', 'a--two']
    )
    for (const failure of output.failed) {
      assert.ok(failure.error!.includes('browser recovery exhausted'))
    }
    assert.equal(computeExitCode(output, false), 1)
  })

  it('terminal exhaustion carries the underlying reason in the error', async () => {
    const { factory } = makeFakeSessionFactory(() => ({
      openPageError: new Error('browser gone for a specific reason'),
    }))

    const output = await captureStories(
      makeOptions({
        storyIds: ['a--one'],
        openSession: factory.open,
        maxRelaunches: 0,
      })
    )

    assert.equal(output.failed.length, 1)
    assert.equal(output.failed[0]!.story, 'a--one')
    assert.match(
      output.failed[0]!.error!,
      /browser gone for a specific reason/,
      'the terminal error names the last underlying session failure'
    )
  })
})

// ---------------------------------------------------------------------------
// Bucket accounting with baselines (mixed outcomes)
// ---------------------------------------------------------------------------

describe('captureStories — bucket accounting', () => {
  it('lands every checked story in exactly one bucket across a mixed run', async () => {
    const scratch = makeScratchDir('vr-session-mixed')
    const baselineDir = path.join(scratch, 'baselines')
    const outputDir = path.join(scratch, 'output')
    fs.mkdirSync(baselineDir, { recursive: true })
    // Screenshot fake always writes solid red: identical baseline passes,
    // blue baseline fails above threshold, missing baseline is new.
    fs.writeFileSync(
      path.join(baselineDir, 'p--ok.png'),
      makeSolidPng(255, 0, 0)
    )
    fs.writeFileSync(
      path.join(baselineDir, 'p--changed.png'),
      makeSolidPng(0, 0, 255)
    )

    const { factory } = makeFakeSessionFactory(() => ({
      pageSpec: pageIndex =>
        pageIndex === 1
          ? { failGotoWith: new Error('Timeout 10000ms exceeded') }
          : {},
    }))

    const storyIds = ['p--ok', 'p--crash', 'p--changed', 'p--fresh']
    const output = await captureStories(
      makeOptions({
        storyIds,
        openSession: factory.open,
        baselineDir,
        outputDir,
      })
    )

    const accounted = [
      ...output.passed,
      ...output.failed.map(failure => failure.story),
      ...output.new_stories,
    ].sort()
    assert.deepEqual(accounted, [...storyIds].sort())
    assert.equal(
      new Set(accounted).size,
      storyIds.length,
      'no double-bucketing'
    )

    assert.deepEqual(output.passed, ['p--ok'])
    assert.deepEqual(output.new_stories, ['p--fresh'])
    const crash = output.failed.find(failure => failure.story === 'p--crash')
    assert.match(crash!.error!, /Timeout 10000ms exceeded/)
    const changed = output.failed.find(
      failure => failure.story === 'p--changed'
    )
    assert.equal(
      changed!.error,
      undefined,
      'above-threshold diff has no error text'
    )
    assert.equal(computeExitCode(output, false), 1)
  })
})

// ---------------------------------------------------------------------------
// Real Playwright adapter against a minimal fake chromium
// ---------------------------------------------------------------------------

describe('createPlaywrightSessionFactory', () => {
  it('launches headless chromium with a 1280x720 context and delegates lifecycle', async () => {
    const fakePage: StoryCapturePage = {
      async goto() {},
      async addStyleTag() {},
      async waitForSelector() {},
      async waitForTimeout() {},
      async screenshot() {},
      async close() {},
    }
    const contexts: Array<{ viewport?: { width: number; height: number } }> = []
    let browserUsable = true
    let contextCloseCalls = 0
    let browserCloseCalls = 0
    let contextCloseShouldReject = false

    const chromium: PlaywrightChromiumLike = {
      async launch() {
        return {
          async newContext(options) {
            contexts.push(options ?? {})
            return {
              async newPage() {
                return fakePage
              },
              async close() {
                contextCloseCalls += 1
                if (contextCloseShouldReject) {
                  throw new Error('Target browser has been closed')
                }
              },
            }
          },
          isConnected: () => browserUsable,
          async close() {
            browserCloseCalls += 1
          },
        }
      },
    }

    const { open } = createPlaywrightSessionFactory(chromium)
    const session = await open()

    assert.deepEqual(contexts, [{ viewport: { width: 1280, height: 720 } }])
    assert.equal(await session.openPage(), fakePage, 'openPage delegates')
    browserUsable = false
    assert.equal(session.isUsable(), false, 'isUsable mirrors isConnected')

    // Cleanup must close the browser even when the context close rejects.
    contextCloseShouldReject = true
    await session.close()
    assert.equal(contextCloseCalls, 1)
    assert.equal(browserCloseCalls, 1)
  })
})
