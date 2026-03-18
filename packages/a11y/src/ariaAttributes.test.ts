import expect from 'expect'
import { describe, it } from 'node:test'
import { addAriaAttribute, removeAriaAttribute } from '~/ariaAttributes'

describe('addAriaAttribute', () => {
  it('adds a value to an element without the attribute', () => {
    const el = document.createElement('div')
    addAriaAttribute(el, 'aria-describedby', 'tooltip-1')
    expect(el.getAttribute('aria-describedby')).toBe('tooltip-1')
  })

  it('appends a value to an existing attribute', () => {
    const el = document.createElement('div')
    el.setAttribute('aria-describedby', 'tooltip-1')
    addAriaAttribute(el, 'aria-describedby', 'tooltip-2')
    expect(el.getAttribute('aria-describedby')).toBe('tooltip-1 tooltip-2')
  })

  it('does not duplicate an existing value', () => {
    const el = document.createElement('div')
    el.setAttribute('aria-describedby', 'tooltip-1')
    addAriaAttribute(el, 'aria-describedby', 'tooltip-1')
    expect(el.getAttribute('aria-describedby')).toBe('tooltip-1')
  })

  it('normalizes whitespace in existing values', () => {
    const el = document.createElement('div')
    el.setAttribute('aria-describedby', '  tooltip-1   tooltip-2  ')
    addAriaAttribute(el, 'aria-describedby', 'tooltip-3')
    expect(el.getAttribute('aria-describedby')).toBe(
      'tooltip-1 tooltip-2 tooltip-3'
    )
  })

  it('handles an empty attribute value', () => {
    const el = document.createElement('div')
    el.setAttribute('aria-describedby', '')
    addAriaAttribute(el, 'aria-describedby', 'tooltip-1')
    expect(el.getAttribute('aria-describedby')).toBe('tooltip-1')
  })

  it('works with aria-labelledby', () => {
    const el = document.createElement('div')
    addAriaAttribute(el, 'aria-labelledby', 'label-1')
    addAriaAttribute(el, 'aria-labelledby', 'label-2')
    expect(el.getAttribute('aria-labelledby')).toBe('label-1 label-2')
  })
})

describe('removeAriaAttribute', () => {
  it('removes a value from the attribute', () => {
    const el = document.createElement('div')
    el.setAttribute('aria-describedby', 'tooltip-1 tooltip-2')
    removeAriaAttribute(el, 'aria-describedby', 'tooltip-1')
    expect(el.getAttribute('aria-describedby')).toBe('tooltip-2')
  })

  it('removes the attribute entirely when the last value is removed', () => {
    const el = document.createElement('div')
    el.setAttribute('aria-describedby', 'tooltip-1')
    removeAriaAttribute(el, 'aria-describedby', 'tooltip-1')
    expect(el.getAttribute('aria-describedby')).toBeNull()
  })

  it('does nothing when the attribute does not exist', () => {
    const el = document.createElement('div')
    removeAriaAttribute(el, 'aria-describedby', 'tooltip-1')
    expect(el.getAttribute('aria-describedby')).toBeNull()
  })

  it('does nothing when the value is not in the list', () => {
    const el = document.createElement('div')
    el.setAttribute('aria-describedby', 'tooltip-1')
    removeAriaAttribute(el, 'aria-describedby', 'tooltip-2')
    expect(el.getAttribute('aria-describedby')).toBe('tooltip-1')
  })

  it('normalizes whitespace after removal', () => {
    const el = document.createElement('div')
    el.setAttribute('aria-describedby', '  tooltip-1   tooltip-2   tooltip-3  ')
    removeAriaAttribute(el, 'aria-describedby', 'tooltip-2')
    expect(el.getAttribute('aria-describedby')).toBe('tooltip-1 tooltip-3')
  })

  it('removes the attribute when only whitespace remains', () => {
    const el = document.createElement('div')
    el.setAttribute('aria-describedby', '  tooltip-1  ')
    removeAriaAttribute(el, 'aria-describedby', 'tooltip-1')
    expect(el.getAttribute('aria-describedby')).toBeNull()
  })
})
