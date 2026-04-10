import expect from 'expect'
import { afterEach, describe, it } from 'node:test'
import { createFocusTrap } from '~/createFocusTrap'

function pressTab(shiftKey = false) {
  const event = new KeyboardEvent('keydown', {
    key: 'Tab',
    shiftKey,
    bubbles: true,
    cancelable: true,
  })
  document.dispatchEvent(event)
  return event
}

describe('createFocusTrap', () => {
  let container: HTMLDivElement
  let trigger: HTMLButtonElement

  afterEach(() => {
    // Clean up DOM
    if (container && container.parentNode) {
      container.parentNode.removeChild(container)
    }
    if (trigger && trigger.parentNode) {
      trigger.parentNode.removeChild(trigger)
    }
  })

  it('activate() moves focus to the first focusable element', () => {
    container = document.createElement('div')
    const btn1 = document.createElement('button')
    btn1.textContent = 'First'
    const btn2 = document.createElement('button')
    btn2.textContent = 'Second'
    container.appendChild(btn1)
    container.appendChild(btn2)
    document.body.appendChild(container)

    const trap = createFocusTrap(container)
    trap.activate()

    expect(document.activeElement).toBe(btn1)
    trap.destroy()
  })

  it('activate() focuses the container when there are no focusable children', () => {
    container = document.createElement('div')
    const span = document.createElement('span')
    span.textContent = 'Not focusable'
    container.appendChild(span)
    document.body.appendChild(container)

    const trap = createFocusTrap(container)
    trap.activate()

    expect(document.activeElement).toBe(container)
    expect(container.tabIndex).toBe(-1)
    trap.destroy()
  })

  it('Tab wraps from last to first focusable element', () => {
    container = document.createElement('div')
    const btn1 = document.createElement('button')
    btn1.textContent = 'First'
    const btn2 = document.createElement('button')
    btn2.textContent = 'Second'
    container.appendChild(btn1)
    container.appendChild(btn2)
    document.body.appendChild(container)

    const trap = createFocusTrap(container)
    trap.activate()

    // Move focus to last button
    btn2.focus()
    expect(document.activeElement).toBe(btn2)

    const event = pressTab(false)

    expect(event.defaultPrevented).toBe(true)
    expect(document.activeElement).toBe(btn1)
    trap.destroy()
  })

  it('Shift+Tab wraps from first to last focusable element', () => {
    container = document.createElement('div')
    const btn1 = document.createElement('button')
    btn1.textContent = 'First'
    const btn2 = document.createElement('button')
    btn2.textContent = 'Second'
    container.appendChild(btn1)
    container.appendChild(btn2)
    document.body.appendChild(container)

    const trap = createFocusTrap(container)
    trap.activate()

    // Focus should be on btn1 after activate
    expect(document.activeElement).toBe(btn1)

    const event = pressTab(true)

    expect(event.defaultPrevented).toBe(true)
    expect(document.activeElement).toBe(btn2)
    trap.destroy()
  })

  it('Tab does nothing when there are no focusable elements (and is prevented)', () => {
    container = document.createElement('div')
    const span = document.createElement('span')
    span.textContent = 'Not focusable'
    container.appendChild(span)
    document.body.appendChild(container)

    const trap = createFocusTrap(container)
    trap.activate()

    const event = pressTab(false)

    expect(event.defaultPrevented).toBe(true)
    trap.destroy()
  })

  it('deactivate() restores focus to the previously focused element', () => {
    trigger = document.createElement('button')
    trigger.textContent = 'Open'
    document.body.appendChild(trigger)
    trigger.focus()

    container = document.createElement('div')
    const btn = document.createElement('button')
    btn.textContent = 'Inside'
    container.appendChild(btn)
    document.body.appendChild(container)

    const trap = createFocusTrap(container)
    trap.activate()

    expect(document.activeElement).toBe(btn)

    trap.deactivate()

    expect(document.activeElement).toBe(trigger)
    trap.destroy()
  })

  it('deactivate() removes the keydown listener', () => {
    container = document.createElement('div')
    const btn1 = document.createElement('button')
    btn1.textContent = 'First'
    const btn2 = document.createElement('button')
    btn2.textContent = 'Second'
    container.appendChild(btn1)
    container.appendChild(btn2)
    document.body.appendChild(container)

    const trap = createFocusTrap(container)
    trap.activate()

    // Focus last button
    btn2.focus()
    trap.deactivate()

    // After deactivate, Tab should not wrap
    btn2.focus()
    const event = pressTab(false)

    // Event should NOT be prevented (trap is no longer active)
    expect(event.defaultPrevented).toBe(false)
    trap.destroy()
  })

  it('deactivate() is idempotent', () => {
    trigger = document.createElement('button')
    trigger.textContent = 'Trigger'
    document.body.appendChild(trigger)
    trigger.focus()

    container = document.createElement('div')
    const btn = document.createElement('button')
    btn.textContent = 'Inside'
    container.appendChild(btn)
    document.body.appendChild(container)

    const trap = createFocusTrap(container)
    trap.activate()

    trap.deactivate()
    // Second deactivate should not throw or cause errors
    trap.deactivate()

    expect(document.activeElement).toBe(trigger)
  })

  it('destroy() deactivates the trap', () => {
    trigger = document.createElement('button')
    trigger.textContent = 'Trigger'
    document.body.appendChild(trigger)
    trigger.focus()

    container = document.createElement('div')
    const btn = document.createElement('button')
    btn.textContent = 'Inside'
    container.appendChild(btn)
    document.body.appendChild(container)

    const trap = createFocusTrap(container)
    trap.activate()

    expect(document.activeElement).toBe(btn)

    trap.destroy()

    // Focus should be restored after destroy
    expect(document.activeElement).toBe(trigger)
  })

  it('activate() focuses the initialFocus element when provided', () => {
    container = document.createElement('div')
    const btn1 = document.createElement('button')
    btn1.textContent = 'First'
    const btn2 = document.createElement('button')
    btn2.textContent = 'Second'
    container.appendChild(btn1)
    container.appendChild(btn2)
    document.body.appendChild(container)

    const trap = createFocusTrap(container, { initialFocus: btn2 })
    trap.activate()

    expect(document.activeElement).toBe(btn2)
    trap.destroy()
  })

  it('activate() falls back to first focusable when initialFocus is outside the container', () => {
    container = document.createElement('div')
    const btn1 = document.createElement('button')
    btn1.textContent = 'First'
    container.appendChild(btn1)
    document.body.appendChild(container)

    const outsideBtn = document.createElement('button')
    outsideBtn.textContent = 'Outside'
    document.body.appendChild(outsideBtn)

    const trap = createFocusTrap(container, { initialFocus: outsideBtn })
    trap.activate()

    // initialFocus is outside container — should fall back to first focusable
    expect(document.activeElement).toBe(btn1)
    trap.destroy()
    outsideBtn.parentNode?.removeChild(outsideBtn)
  })

  it('activate() falls back to first focusable when initialFocus is inside aria-hidden subtree', () => {
    container = document.createElement('div')
    const btn1 = document.createElement('button')
    btn1.textContent = 'First'
    const hiddenDiv = document.createElement('div')
    hiddenDiv.setAttribute('aria-hidden', 'true')
    const hiddenBtn = document.createElement('button')
    hiddenBtn.textContent = 'Hidden'
    hiddenDiv.appendChild(hiddenBtn)
    container.appendChild(btn1)
    container.appendChild(hiddenDiv)
    document.body.appendChild(container)

    const trap = createFocusTrap(container, { initialFocus: hiddenBtn })
    trap.activate()

    // initialFocus is in aria-hidden subtree — should fall back to first focusable
    expect(document.activeElement).toBe(btn1)
    trap.destroy()
  })

  it('deactivate() restores container tabIndex to its original value', () => {
    container = document.createElement('div')
    const span = document.createElement('span')
    span.textContent = 'Not focusable'
    container.appendChild(span)
    document.body.appendChild(container)

    // Verify no tabIndex set before activation
    expect(container.getAttribute('tabindex')).toBe(null)

    const trap = createFocusTrap(container)
    trap.activate()

    // Trap should have set tabIndex=-1 to allow focus
    expect(container.tabIndex).toBe(-1)

    trap.deactivate()

    // Should be restored: attribute removed (tabIndex reads as -1 but attribute not present)
    expect(container.getAttribute('tabindex')).toBe(null)
    trap.destroy()
  })

  it('Tab wraps when a child stops propagation (capture phase handles it)', () => {
    container = document.createElement('div')
    const btn1 = document.createElement('button')
    btn1.textContent = 'First'
    const btn2 = document.createElement('button')
    btn2.textContent = 'Second'
    container.appendChild(btn1)
    container.appendChild(btn2)
    document.body.appendChild(container)

    // A child listener that stops propagation on the bubbling phase
    btn2.addEventListener('keydown', evt => {
      evt.stopPropagation()
    })

    const trap = createFocusTrap(container)
    trap.activate()

    btn2.focus()
    expect(document.activeElement).toBe(btn2)

    // Dispatch on btn2 directly (not document) — stopPropagation will prevent bubbling
    const event = new KeyboardEvent('keydown', {
      key: 'Tab',
      bubbles: true,
      cancelable: true,
    })
    btn2.dispatchEvent(event)

    expect(event.defaultPrevented).toBe(true)
    expect(document.activeElement).toBe(btn1)
    trap.destroy()
  })
})
