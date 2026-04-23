import { createRequire } from 'module'
import { afterEach, describe, it } from 'node:test'

import assert from 'node:assert/strict'

const require = createRequire(import.meta.url)

require('../../../../../node_modules/.pnpm/node_modules/global-jsdom/commonjs/register.cjs')

const React = require('react')
const { cleanup, render, screen } = require('@testing-library/react')

globalThis.React = React

afterEach(cleanup)

describe('recording playback feature route', () => {
  it('exports route metadata', async t => {
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

    const { metadata } = await import('./page')

    assert.equal(metadata.title, 'Recording and playback')
    assert.match(
      metadata.description ?? '',
      /DOM mutations, interactions, network activity, console output, and performance metrics/i
    )
  })

  it('renders the feature page with the core story and CTAs', async t => {
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

    const { default: RecordingPlaybackPage } = await import('./page')
    const { SiteLayout } = await import('../../../components/SiteLayout')

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
})
