import 'global-jsdom/register'

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { closestInert, isInert } from './index'

describe('closestInert', () => {
  it('returns the element itself when it has the inert attribute', () => {
    const el = document.createElement('div')
    el.setAttribute('inert', '')
    assert.equal(closestInert(el), el)
  })

  it('returns null when the element has no inert attribute and no inert ancestor', () => {
    const el = document.createElement('div')
    assert.equal(closestInert(el), null)
  })

  it('returns the inert ancestor when the element is nested inside an inert subtree', () => {
    const ancestor = document.createElement('div')
    ancestor.setAttribute('inert', '')
    const child = document.createElement('span')
    ancestor.appendChild(child)
    assert.equal(closestInert(child), ancestor)
  })

  it('returns null for a deeply nested element with no inert ancestor', () => {
    const parent = document.createElement('div')
    const child = document.createElement('span')
    const grandchild = document.createElement('em')
    child.appendChild(grandchild)
    parent.appendChild(child)
    assert.equal(closestInert(grandchild), null)
  })

  it('returns null for a detached element with no inert', () => {
    const el = document.createElement('div')
    assert.equal(closestInert(el), null)
  })
})

describe('isInert', () => {
  it('returns true when the element itself has the inert attribute', () => {
    const el = document.createElement('div')
    el.setAttribute('inert', '')
    assert.equal(isInert(el), true)
  })

  it('returns false when the element has no inert attribute and no inert ancestor', () => {
    const el = document.createElement('div')
    assert.equal(isInert(el), false)
  })

  it('returns true when the element is nested inside an inert ancestor', () => {
    const ancestor = document.createElement('div')
    ancestor.setAttribute('inert', '')
    const child = document.createElement('span')
    ancestor.appendChild(child)
    assert.equal(isInert(child), true)
  })

  it('returns false for a deeply nested element with no inert ancestor', () => {
    const parent = document.createElement('div')
    const child = document.createElement('span')
    parent.appendChild(child)
    assert.equal(isInert(child), false)
  })
})
