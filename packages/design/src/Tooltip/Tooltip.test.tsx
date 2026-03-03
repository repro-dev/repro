import expect from 'expect'
import { afterEach, before, describe, it } from 'node:test'
import React, { act, type ReactNode } from 'react'
import { createRoot, Root } from 'react-dom/client'
import { PortalRootProvider } from '../Portal/PortalRootProvider'
import { Tooltip } from './Tooltip'

before(() => {
  ;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true
})

let root: Root | null = null
let container: HTMLDivElement | null = null

function setUp() {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
}

async function tearDown() {
  if (root) {
    await act(() => {
      root!.unmount()
    })
    root = null
  }
  if (container) {
    document.body.removeChild(container)
    container = null
  }
  ;(document.activeElement as HTMLElement | null)?.blur?.()
}

async function render(element: ReactNode) {
  if (!root || !container) {
    setUp()
  }
  await act(async () => {
    root!.render(element)
  })
}

function createTooltipTree(tooltipProps?: {
  delay?: number
  position?: 'top' | 'bottom' | 'left' | 'right'
}) {
  return (
    <PortalRootProvider>
      <button id="trigger">
        Hover me
        <Tooltip {...(tooltipProps ?? {})}>Tooltip text</Tooltip>
      </button>
    </PortalRootProvider>
  )
}

async function showViaFocus() {
  const trigger = document.getElementById('trigger')!
  await act(() => {
    trigger.dispatchEvent(new FocusEvent('focus', { bubbles: true }))
  })
}

async function hideViaBlur() {
  const trigger = document.getElementById('trigger')!
  await act(() => {
    trigger.dispatchEvent(new FocusEvent('blur', { bubbles: true }))
  })
}

describe('Tooltip', () => {
  afterEach(tearDown)

  it('renders a tooltip element with role="tooltip" when shown', async () => {
    setUp()
    await render(createTooltipTree())
    await showViaFocus()

    const tooltip = document.querySelector('[role="tooltip"]')
    expect(tooltip).not.toBeNull()
  })

  it('sets aria-hidden="false" when visible', async () => {
    setUp()
    await render(createTooltipTree())
    await showViaFocus()

    const tooltip = document.querySelector('[role="tooltip"]')
    expect(tooltip?.getAttribute('aria-hidden')).toBe('false')
  })

  it('sets aria-hidden="true" when hidden', async () => {
    setUp()
    await render(createTooltipTree())
    await showViaFocus()
    await hideViaBlur()

    const tooltip = document.querySelector('[role="tooltip"]')
    expect(tooltip?.getAttribute('aria-hidden')).toBe('true')
  })

  it('sets aria-describedby on the trigger when shown via focus', async () => {
    setUp()
    await render(createTooltipTree())
    await showViaFocus()

    const trigger = document.getElementById('trigger')!
    const tooltip = document.querySelector('[role="tooltip"]')
    const tooltipId = tooltip?.getAttribute('id')

    expect(tooltipId).toBeTruthy()
    expect(trigger.getAttribute('aria-describedby')).toContain(tooltipId)
  })

  it('removes aria-describedby from the trigger on blur', async () => {
    setUp()
    await render(createTooltipTree())
    await showViaFocus()
    await hideViaBlur()

    const trigger = document.getElementById('trigger')!
    expect(trigger.getAttribute('aria-describedby')).toBeNull()
  })

  it('shows on pointerenter after delay', async () => {
    setUp()
    await render(createTooltipTree({ delay: 0 }))

    const trigger = document.getElementById('trigger')!
    await act(() => {
      trigger.dispatchEvent(new PointerEvent('pointerenter', { bubbles: true }))
    })

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 20))
    })

    const tooltip = document.querySelector('[role="tooltip"]')
    expect(tooltip?.getAttribute('aria-hidden')).toBe('false')
  })

  it('hides on pointerleave', async () => {
    setUp()
    await render(createTooltipTree({ delay: 0 }))

    const trigger = document.getElementById('trigger')!
    await act(() => {
      trigger.dispatchEvent(new PointerEvent('pointerenter', { bubbles: true }))
    })

    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 20))
    })

    const tooltip = document.querySelector('[role="tooltip"]')
    expect(tooltip?.getAttribute('aria-hidden')).toBe('false')

    await act(() => {
      trigger.dispatchEvent(new PointerEvent('pointerleave', { bubbles: true }))
    })

    expect(tooltip?.getAttribute('aria-hidden')).toBe('true')
  })

  it('has a unique id on the tooltip for aria-describedby association', async () => {
    setUp()
    await render(createTooltipTree())
    await showViaFocus()

    const tooltip = document.querySelector('[role="tooltip"]')
    const id = tooltip?.getAttribute('id')
    expect(id).toBeTruthy()
    expect(id!.length).toBeGreaterThan(0)
  })
})
