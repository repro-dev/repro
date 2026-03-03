import { cleanup, render } from '@testing-library/react'
import expect from 'expect'
import { afterEach, describe, it } from 'node:test'
import React, { act } from 'react'
import { PortalRootProvider } from '../Portal/PortalRootProvider'
import { Tooltip } from './Tooltip'

afterEach(cleanup)

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
  it('renders a tooltip element with role="tooltip" when shown', async () => {
    render(createTooltipTree())
    await showViaFocus()

    const tooltip = document.querySelector('[role="tooltip"]')
    expect(tooltip).not.toBeNull()
  })

  it('sets aria-hidden="false" when visible', async () => {
    render(createTooltipTree())
    await showViaFocus()

    const tooltip = document.querySelector('[role="tooltip"]')
    expect(tooltip?.getAttribute('aria-hidden')).toBe('false')
  })

  it('sets aria-hidden="true" when hidden', async () => {
    render(createTooltipTree())
    await showViaFocus()
    await hideViaBlur()

    const tooltip = document.querySelector('[role="tooltip"]')
    expect(tooltip?.getAttribute('aria-hidden')).toBe('true')
  })

  it('sets aria-describedby on the trigger when shown via focus', async () => {
    render(createTooltipTree())
    await showViaFocus()

    const trigger = document.getElementById('trigger')!
    const tooltip = document.querySelector('[role="tooltip"]')
    const tooltipId = tooltip?.getAttribute('id')

    expect(tooltipId).toBeTruthy()
    expect(trigger.getAttribute('aria-describedby')).toContain(tooltipId)
  })

  it('removes aria-describedby from the trigger on blur', async () => {
    render(createTooltipTree())
    await showViaFocus()
    await hideViaBlur()

    const trigger = document.getElementById('trigger')!
    expect(trigger.getAttribute('aria-describedby')).toBeNull()
  })

  it('shows on pointerenter after delay', async () => {
    render(createTooltipTree({ delay: 0 }))

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
    render(createTooltipTree({ delay: 0 }))

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
    render(createTooltipTree())
    await showViaFocus()

    const tooltip = document.querySelector('[role="tooltip"]')
    const id = tooltip?.getAttribute('id')
    expect(id).toBeTruthy()
    expect(id!.length).toBeGreaterThan(0)
  })
})
