import expect from 'expect'
import { describe, it } from 'node:test'
import { visuallyHidden } from '~/visuallyHidden'

describe('visuallyHidden', () => {
  it('sets position to absolute', () => {
    expect(visuallyHidden.position).toBe('absolute')
  })

  it('sets width and height to 1', () => {
    expect(visuallyHidden.width).toBe(1)
    expect(visuallyHidden.height).toBe(1)
  })

  it('sets padding to 0', () => {
    expect(visuallyHidden.padding).toBe(0)
  })

  it('sets margin to -1', () => {
    expect(visuallyHidden.margin).toBe(-1)
  })

  it('sets overflow to hidden', () => {
    expect(visuallyHidden.overflow).toBe('hidden')
  })

  it('sets clip to rect(0, 0, 0, 0)', () => {
    expect(visuallyHidden.clip).toBe('rect(0, 0, 0, 0)')
  })

  it('sets whiteSpace to nowrap', () => {
    expect(visuallyHidden.whiteSpace).toBe('nowrap')
  })

  it('sets borderWidth to 0', () => {
    expect(visuallyHidden.borderWidth).toBe(0)
  })
})
