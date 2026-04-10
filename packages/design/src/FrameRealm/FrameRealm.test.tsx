import { cleanup, render } from '@testing-library/react'
import expect from 'expect'
import { afterEach, describe, it } from 'node:test'
import React from 'react'
import { FrameRealm } from './FrameRealm'

afterEach(cleanup)

describe('FrameRealm', () => {
  it('renders an <iframe> element', () => {
    render(<FrameRealm />)
    const iframe = document.querySelector('iframe')
    expect(iframe).not.toBeNull()
  })

  it('forwards the inert attribute to the iframe when prop is passed', () => {
    // React 18 does not recognise inert as a native boolean attr, so pass ""
    // (empty string) which React forwards via setAttribute — the browser and
    // jsdom then interpret the presence of the attribute as inert=true.
    render(<FrameRealm inert="" />)
    const iframe = document.querySelector('iframe')
    expect(iframe).not.toBeNull()
    // The inert attribute is a boolean HTML attribute — its presence means true
    expect(iframe!.hasAttribute('inert')).toBe(true)
  })

  it('iframe does not have inert by default', () => {
    render(<FrameRealm />)
    const iframe = document.querySelector('iframe')
    expect(iframe).not.toBeNull()
    expect(iframe!.hasAttribute('inert')).toBe(false)
  })

  it('iframe does not have inert when inert=undefined is passed explicitly', () => {
    // Mirrors PlaybackCanvas interactive mode: inert={interactive ? undefined : ''}
    // When interactive=true the expression evaluates to undefined, which should
    // result in the attribute being absent (not inert).
    render(<FrameRealm inert={undefined} />)
    const iframe = document.querySelector('iframe')
    expect(iframe).not.toBeNull()
    expect(iframe!.hasAttribute('inert')).toBe(false)
  })

  it('forwards additional HTML props (e.g. data-testid) to the iframe', () => {
    render(<FrameRealm data-testid="test-frame" />)
    const iframe = document.querySelector('iframe')
    expect(iframe?.getAttribute('data-testid')).toBe('test-frame')
  })
})
