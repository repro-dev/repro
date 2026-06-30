import 'global-jsdom/register'

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { getTargetElementAtPoint } from './PickerOverlay'

function mockDoc(stack: Element[]): Document {
  return {
    elementsFromPoint: () => stack,
    documentElement: { clientWidth: 100 },
  } as unknown as Document
}

function mockIframe(
  contentDoc: Document | null,
  el?: HTMLIFrameElement
): HTMLIFrameElement {
  const iframe = el ?? document.createElement('iframe')
  Object.defineProperty(iframe, 'contentDocument', {
    value: contentDoc,
    configurable: true,
  })
  return iframe
}

const bb = { left: 0, top: 0, width: 100, height: 100 } as DOMRect

describe('getTargetElementAtPoint', () => {
  it('returns the first non-inert element when inert is first in stack', () => {
    const inertDiv = document.createElement('div')
    inertDiv.setAttribute('inert', '')
    const normalDiv = document.createElement('div')
    const doc = mockDoc([inertDiv, normalDiv])
    const result = getTargetElementAtPoint(bb, doc, 50, 50)
    assert.equal(result, normalDiv)
  })

  it('skips an element inside an inert subtree', () => {
    const ancestor = document.createElement('div')
    ancestor.setAttribute('inert', '')
    const child = document.createElement('span')
    ancestor.appendChild(child)
    const normalDiv = document.createElement('div')
    const doc = mockDoc([child, normalDiv])
    const result = getTargetElementAtPoint(bb, doc, 50, 50)
    assert.equal(result, normalDiv)
  })

  it('descends into an inert iframe (wrapper-iframe exemption)', () => {
    const innerNormal = document.createElement('div')
    const innerDoc = mockDoc([innerNormal])
    const inertIframe = mockIframe(innerDoc)
    inertIframe.setAttribute('inert', '')
    const doc = mockDoc([inertIframe])
    const result = getTargetElementAtPoint(bb, doc, 50, 50)
    // The iframe is descended into, so innerNormal is returned
    assert.equal(result, innerNormal)
  })

  it('honors inert inside the replayed document', () => {
    const innerInert = document.createElement('div')
    innerInert.setAttribute('inert', '')
    const innerNormal = document.createElement('div')
    const innerDoc = mockDoc([innerInert, innerNormal])
    const iframe = mockIframe(innerDoc)
    const outerDoc = mockDoc([iframe])
    const result = getTargetElementAtPoint(bb, outerDoc, 50, 50)
    // Descends into iframe, skips innerInert, returns innerNormal
    assert.equal(result, innerNormal)
  })

  it('returns null when all non-iframe elements in stack are inert', () => {
    const div1 = document.createElement('div')
    div1.setAttribute('inert', '')
    const div2 = document.createElement('div')
    div2.setAttribute('inert', '')
    const doc = mockDoc([div1, div2])
    const result = getTargetElementAtPoint(bb, doc, 50, 50)
    assert.equal(result, null)
  })

  it('returns null for an empty elementsFromPoint stack', () => {
    const doc = mockDoc([])
    const result = getTargetElementAtPoint(bb, doc, 50, 50)
    assert.equal(result, null)
  })

  it('returns null when doc is null', () => {
    const result = getTargetElementAtPoint(bb, null, 50, 50)
    assert.equal(result, null)
  })
})
