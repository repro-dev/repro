import 'global-jsdom/register'

import { cleanup, fireEvent, render } from '@testing-library/react'
import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'
import React from 'react'

describe('DevTools fullscreen', () => {
  afterEach(() => {
    cleanup()
  })

  it('toggles fullscreen for the whole shell and keeps toolbar controls visible', async t => {
    let fullscreenElement: Element | null = null

    Object.defineProperty(document, 'fullscreenElement', {
      configurable: true,
      get: () => fullscreenElement,
    })
    Object.defineProperty(document, 'exitFullscreen', {
      configurable: true,
      value: () => {
        fullscreenElement = null
        document.dispatchEvent(new window.Event('fullscreenchange'))
        return Promise.resolve()
      },
    })
    Object.defineProperty(HTMLElement.prototype, 'requestFullscreen', {
      configurable: true,
      value: function (this: Element) {
        fullscreenElement = this
        document.dispatchEvent(new window.Event('fullscreenchange'))
        return Promise.resolve()
      },
    })

    t.mock.module('@repro/analytics', {
      namedExports: {
        Analytics: {
          track: () => {},
        },
      },
    })

    t.mock.module('@repro/auth', {
      namedExports: {
        IfGate: ({ children }: React.PropsWithChildren<{ gate: string }>) => (
          <>{children}</>
        ),
      },
    })

    t.mock.module('@repro/css-utils', {
      namedExports: {
        ReferenceStyleProvider: ({ children }: React.PropsWithChildren) => (
          <>{children}</>
        ),
      },
    })

    t.mock.module('@repro/playback', {
      namedExports: {
        PlaybackCanvas: ({ children }: React.PropsWithChildren) => (
          <div data-testid="playback-canvas">{children}</div>
        ),
        PlaybackNavigation: () => <div data-testid="playback-navigation" />,
        SimpleTimeline: () => <div data-testid="toolbar-timeline" />,
      },
    })

    t.mock.module('./PickerOverlay', {
      namedExports: {
        PickerOverlay: () => null,
      },
    })

    t.mock.module('./DragHandle', {
      namedExports: {
        DragHandle: () => null,
      },
    })

    t.mock.module('./ElementsPanel', {
      namedExports: {
        ElementsPanel: () => null,
      },
    })

    t.mock.module('./NetworkPanel', {
      namedExports: {
        NetworkPanel: () => null,
      },
    })

    t.mock.module('./ConsolePanel', {
      namedExports: {
        ConsolePanel: () => null,
      },
    })

    t.mock.module('./ReactPanel', {
      namedExports: {
        ReactPanel: () => null,
      },
    })

    t.mock.module('./ReduxPanel', {
      namedExports: {
        ReduxPanel: () => null,
      },
    })

    t.mock.module('./Toolbar/Picker', {
      namedExports: {
        Picker: () => <div data-testid="toolbar-picker" />,
      },
    })

    t.mock.module('./Toolbar/Tabs', {
      namedExports: {
        Tabs: () => <div data-testid="toolbar-tabs" />,
      },
    })

    t.mock.module('./Toolbar/Toggle', {
      namedExports: {
        Toggle: () => <div data-testid="toolbar-toggle" />,
      },
    })

    t.mock.module('./hooks', {
      namedExports: {
        useCurrentDocument: () => [null, () => {}],
        useDevToolsView: () => [0],
        useElementPicker: () => [false, () => {}],
        useInspecting: () => [false, () => {}],
        useMask: () => [false],
        useNodeMap: () => [null, () => {}],
        useSize: () => [240],
      },
    })

    const { DevTools } = await import('./DevTools.js')

    const { container } = render(<DevTools />)

    assert.ok(container.querySelector('[title="Enter fullscreen"]'))
    assert.ok(container.querySelector('[data-testid="playback-navigation"]'))
    assert.ok(container.querySelector('[data-testid="toolbar-timeline"]'))

    const enterButton = container.querySelector('[title="Enter fullscreen"]')
    fireEvent.click(enterButton as Element)

    assert.strictEqual(document.fullscreenElement, container.firstElementChild)
    assert.ok(container.querySelector('[title="Exit fullscreen"]'))
    assert.ok(container.querySelector('[data-testid="playback-navigation"]'))
    assert.ok(container.querySelector('[data-testid="toolbar-timeline"]'))

    fullscreenElement = container.querySelector(
      '[data-testid="playback-canvas"]'
    )
    document.dispatchEvent(new window.Event('fullscreenchange'))

    assert.ok(container.querySelector('[title="Exit fullscreen"]'))

    const exitButton = container.querySelector('[title="Exit fullscreen"]')
    fireEvent.click(exitButton as Element)

    assert.strictEqual(document.fullscreenElement, null)
    assert.ok(container.querySelector('[title="Enter fullscreen"]'))
  })
})
