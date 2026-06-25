import expect from 'expect'
import { describe, it } from 'node:test'
import { duration, easing, transition } from './motion'

describe('easing tokens', () => {
  it('easing.default is ease-in-out', () => {
    expect(easing.default).toBe('ease-in-out')
  })

  it('easing.linear is linear', () => {
    expect(easing.linear).toBe('linear')
  })

  it('easing.easeOut is ease-out', () => {
    expect(easing.easeOut).toBe('ease-out')
  })

  it('easing.easeOutQuart is cubic-bezier(0.25, 1, 0.5, 1)', () => {
    expect(easing.easeOutQuart).toBe('cubic-bezier(0.25, 1, 0.5, 1)')
  })

  it('easing.easeOutExpo is cubic-bezier(0.16, 1, 0.3, 1)', () => {
    expect(easing.easeOutExpo).toBe('cubic-bezier(0.16, 1, 0.3, 1)')
  })
})

describe('transition presets', () => {
  it('transition.default uses easeOut instead of default (ease-in-out)', () => {
    const expected = `all ${duration[200]} ${easing.easeOut}`
    expect(transition.default).toBe(expected)
  })

  it('transition.fast uses easeOut', () => {
    const expected = `all ${duration[100]} ${easing.easeOut}`
    expect(transition.fast).toBe(expected)
  })

  it('transition.transform uses easeOut', () => {
    const expected = `transform ${duration[100]} ${easing.easeOut}`
    expect(transition.transform).toBe(expected)
  })

  it('transition.opacity uses easeOut', () => {
    const expected = `opacity ${duration[200]} ${easing.easeOut}`
    expect(transition.opacity).toBe(expected)
  })

  it('transition.defaultQuart uses easeOutQuart', () => {
    const expected = `all ${duration[200]} ${easing.easeOutQuart}`
    expect(transition.defaultQuart).toBe(expected)
  })

  it('transition.transformExpo uses easeOutExpo', () => {
    const expected = `transform ${duration[200]} ${easing.easeOutExpo}`
    expect(transition.transformExpo).toBe(expected)
  })
})
