import type { Point } from '@repro/domain'
import { cleanup, render } from '@testing-library/react'
import expect from 'expect'
import { afterEach, describe, it } from 'node:test'
import React from 'react'
import { BehaviorSubject } from 'rxjs'
import { ControlFrame } from '../types'

describe('PointerTrail', () => {
  afterEach(() => {
    cleanup()
  })

  it('renders a canvas with aria-hidden="true" and pointer-events none', async t => {
    const controlFrame$ = new BehaviorSubject<ControlFrame>(ControlFrame.Idle)

    t.mock.module('../hooks', {
      namedExports: {
        usePlayback: () => ({
          getElapsed: () => 0,
        }),
        useSnapshot: () => ({
          dom: null,
          interaction: {
            pointer: [100, 200] as Point,
            pointerState: 0 as any,
            scroll: {},
            viewport: [1024, 768] as Point,
            pageURL: '/test',
          },
          frameworkState: null,
          cssRules: null,
        }),
        useLatestControlFrame: () => controlFrame$.getValue(),
        useViewport: () => [1024, 768] as Point,
      },
    })

    const { PointerTrail } = await import('./PointerTrail')

    const { container } = render(<PointerTrail />)
    const canvas = container.querySelector('canvas')

    expect(canvas).not.toBeNull()
    expect(canvas!.getAttribute('aria-hidden')).toBe('true')
    expect(canvas!.style.pointerEvents).toBe('none')
  })

  it('handles null interaction gracefully (no pointer data)', async t => {
    t.mock.module('../hooks', {
      namedExports: {
        usePlayback: () => ({
          getElapsed: () => 0,
        }),
        useSnapshot: () => ({
          dom: null,
          interaction: null,
          frameworkState: null,
          cssRules: null,
        }),
        useLatestControlFrame: () => ControlFrame.Idle,
        useViewport: () => [1024, 768] as Point,
      },
    })

    const { PointerTrail } = await import('./PointerTrail')

    const { container } = render(<PointerTrail />)
    const canvas = container.querySelector('canvas')

    expect(canvas).not.toBeNull()
  })
})
