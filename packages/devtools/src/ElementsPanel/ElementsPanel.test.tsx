import 'global-jsdom/register'

import { cleanup, render } from '@testing-library/react'
import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'node:test'
import React from 'react'

describe('ElementsPanel tab integration', () => {
  afterEach(cleanup)

  async function setupTest(t: any) {
    t.mock.module('../hooks', {
      namedExports: {
        useSelectedElement: () => null,
        useSelectedNode: () => [null, () => {}],
        useFocusedNode: () => [null, () => {}],
        useElementPicker: () => [false, () => {}],
        useNodeMap: () => [null, () => {}],
        useSize: () => [240],
        useMatchedCSSRules: () => null,
      },
    })

    t.mock.module('@repro/playback', {
      namedExports: {
        useSnapshot: () => ({
          dom: null,
          cssRules: [],
        }),
        usePlayback: () => ({
          $breakpoints: {
            getValue: () => [],
            pipe: () => ({
              subscribe: () => ({ unsubscribe: () => {} }),
            }),
          },
          $activeBreakpoint: {
            getValue: () => null,
            pipe: () => ({
              subscribe: () => ({ unsubscribe: () => {} }),
            }),
          },
          getBreakpoints: () => [],
          addBreakpoint: () => {},
          removeBreakpoint: () => {},
        }),
        useLatestControlFrame: () => null,
        useElapsed: () => 0,
      },
    })

    t.mock.module('@repro/css-utils', {
      namedExports: {
        ReferenceStyleProvider: ({ children }: React.PropsWithChildren) => (
          <>{children}</>
        ),
        useReferenceStyle: () => () => ({}),
        createCSSPropertyMap: () => ({}),
        createGroupedCSSPropertyMap: [],
        getMargin: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
        getBorder: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
        getPadding: () => ({ top: 0, right: 0, bottom: 0, left: 0 }),
        resolveValue: () => 0,
      },
    })

    t.mock.module('@repro/auth', {
      namedExports: {
        IfGate: ({ children }: React.PropsWithChildren<{ gate: string }>) => (
          <>{children}</>
        ),
      },
    })

    const { ElementsPanel } = await import('./ElementsPanel.js')
    return { ElementsPanel }
  }

  it('renders a tablist with two tabs labeled Styles and Computed', async t => {
    const { ElementsPanel } = await setupTest(t)
    const { container } = render(<ElementsPanel />)

    const tablist = container.querySelector('[role="tablist"]')
    assert.ok(tablist, 'tablist must be rendered')

    const tabs = container.querySelectorAll('[role="tab"]')
    assert.equal(tabs.length, 2)

    const tabLabels = Array.from(tabs).map(t => t.textContent)
    assert.ok(tabLabels.includes('Styles'))
    assert.ok(tabLabels.includes('Computed'))
  })

  it('sets Styles tab as default selected', async t => {
    const { ElementsPanel } = await setupTest(t)
    const { container } = render(<ElementsPanel />)

    const tabs = container.querySelectorAll('[role="tab"]')
    assert.equal(tabs[0]?.getAttribute('aria-selected'), 'true')
    assert.equal(tabs[1]?.getAttribute('aria-selected'), 'false')
  })
})
