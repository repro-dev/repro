import { createRequire } from 'module'
import { afterEach, describe, it } from 'node:test'

import assert from 'node:assert/strict'

const require = createRequire(import.meta.url)

if (process.env.NODE_ENV !== 'production') {
  require('../../../../node_modules/.pnpm/node_modules/global-jsdom/commonjs/register.cjs')
}

const React = require('react')
const { cleanup, render, screen } = require('@testing-library/react')
const { renderToString } = require('react-dom/server')

globalThis.React = React

afterEach(cleanup)

function setViewportWidth(width: number) {
  Object.defineProperty(window, 'innerWidth', {
    configurable: true,
    value: width,
    writable: true,
  })

  window.dispatchEvent(new Event('resize'))
}

function getResponsiveGrid(heading: string) {
  const section = screen
    .getByRole('heading', { name: heading })
    .closest('section')

  assert.ok(section)

  const grid = section.querySelector('.recording-playback__responsive-grid')

  assert.ok(grid)

  return grid
}

describe('recording playback feature route', () => {
  it('renders the server markup without viewport-dependent branching', async t => {
    t.mock.module('~/config/env', {
      namedExports: {
        createEnv: t.mock.fn(() => ({
          REPRO_APP_URL: 'https://app.example.test',
        })),
        defaultEnv: {
          REPRO_APP_URL: 'https://app.example.test',
          REPRO_MARKETING_URL: 'https://repro.dev',
        },
      },
    })

    const { JsxstyleRegistry } = await import('../app/JsxstyleRegistry')
    const { default: RecordingPlaybackPage, metadata } = await import(
      '../app/features/recording-playback/page'
    )

    const markup = renderToString(
      React.createElement(JsxstyleRegistry, null, RecordingPlaybackPage())
    )

    assert.equal(metadata.title, 'Recording and playback')
    assert.match(
      metadata.description ?? '',
      /DOM mutations, interactions, network activity, console output, and performance metrics/i
    )
    assert.match(markup, /recording-playback__responsive-grid/)
    assert.match(markup, /recording-playback__recording-grid/)
    assert.match(markup, /recording-playback__playback-grid/)
    assert.match(markup, /recording-playback__devtools-grid/)
    assert.match(markup, /https:\/\/app\.example\.test/)
    assert.doesNotMatch(markup, /data-layout=/)
  })

  it('keeps the story intact at mobile widths', async t => {
    setViewportWidth(375)

    t.mock.module('~/config/env', {
      namedExports: {
        createEnv: t.mock.fn(() => ({
          REPRO_APP_URL: 'https://app.example.test',
        })),
        defaultEnv: {
          REPRO_APP_URL: 'https://app.example.test',
          REPRO_MARKETING_URL: 'https://repro.dev',
        },
      },
    })

    const { default: RecordingPlaybackPage } = await import(
      '../app/features/recording-playback/page'
    )
    const { SiteLayout } = await import('./SiteLayout')

    render(React.createElement(SiteLayout, null, RecordingPlaybackPage()))

    assert.ok(
      screen.getByRole('heading', {
        name: 'Capture the bug, then replay the session',
      })
    )
    assert.ok(screen.getByRole('heading', { name: 'Recording' }))
    assert.ok(screen.getByText(/Binary encoding keeps payloads small/i))
    assert.ok(
      screen.getByText(/Periodic snapshots keep the ring buffer seekable/i)
    )
    assert.ok(
      screen.getByText(
        /Passwords, clipboard contents, and other sensitive fields/i
      )
    )

    assert.ok(screen.getByRole('heading', { name: 'Playback' }))
    assert.ok(screen.getByText(/sandboxed iframe/i))
    assert.ok(
      screen.getByText(
        /pause at a breakpoint, scrub the range selector, and keep going even without a live connection/i
      )
    )
    assert.ok(screen.getByText(/offline playback supported/i))

    assert.ok(screen.getByRole('heading', { name: 'DevTools integration' }))
    assert.ok(screen.getByText(/Elements, Network, and Console/i))
    assert.ok(screen.getByText(/upcoming Performance panel/i))

    assert.ok(
      getResponsiveGrid('Recording').classList.contains(
        'recording-playback__recording-grid'
      )
    )
    assert.ok(
      getResponsiveGrid('Playback').classList.contains(
        'recording-playback__playback-grid'
      )
    )
    assert.ok(
      getResponsiveGrid('DevTools integration').classList.contains(
        'recording-playback__devtools-grid'
      )
    )

    assert.equal(
      screen.getByRole('link', { name: 'Try it free' }).getAttribute('href'),
      'https://app.example.test'
    )
    assert.equal(
      screen
        .getByRole('link', { name: 'Install extension' })
        .getAttribute('href'),
      'https://chrome.google.com/webstore/detail/repro/ecmbphfjfhnifmhbjhpejbpdnpanpice'
    )
  })

  it('reflows the section grids at 768px', async t => {
    setViewportWidth(768)

    t.mock.module('~/config/env', {
      namedExports: {
        createEnv: t.mock.fn(() => ({
          REPRO_APP_URL: 'https://app.example.test',
        })),
        defaultEnv: {
          REPRO_APP_URL: 'https://app.example.test',
          REPRO_MARKETING_URL: 'https://repro.dev',
        },
      },
    })

    const { default: RecordingPlaybackPage } = await import(
      '../app/features/recording-playback/page'
    )
    const { SiteLayout } = await import('./SiteLayout')

    render(React.createElement(SiteLayout, null, RecordingPlaybackPage()))

    assert.ok(
      getResponsiveGrid('Recording').classList.contains(
        'recording-playback__recording-grid'
      )
    )
    assert.ok(
      getResponsiveGrid('Playback').classList.contains(
        'recording-playback__playback-grid'
      )
    )
    assert.ok(
      getResponsiveGrid('DevTools integration').classList.contains(
        'recording-playback__devtools-grid'
      )
    )
  })
})
