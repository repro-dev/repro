import { cleanup, render } from '@testing-library/react'
import expect from 'expect'
import { afterEach, describe, it } from 'node:test'
import React from 'react'
import { BehaviorSubject } from 'rxjs'

describe('PlaybackCanvas fullscreen', () => {
  afterEach(() => {
    cleanup()
  })

  it('does not own fullscreen controls', async t => {
    const playback = {
      $elapsed: new BehaviorSubject(0),
      $latestEventTime: new BehaviorSubject(0),
      getDuration: () => 10,
    }

    t.mock.module('@repro/design', {
      namedExports: {
        ...(await import('@repro/design')),
        Delay: ({ children }: React.PropsWithChildren) => <>{children}</>,
        FX: {
          Spin: ({ children }: React.PropsWithChildren) => <>{children}</>,
        },
        FrameRealm: React.forwardRef<HTMLDivElement, React.PropsWithChildren>(
          ({ children }, ref) => <div ref={ref}>{children}</div>
        ),
      },
    })

    t.mock.module('..', {
      namedExports: {
        usePlayback: () => playback,
      },
    })

    t.mock.module('../PlaybackErrorBoundary', {
      namedExports: {
        withPlaybackErrorBoundary: (component: React.ComponentType<any>) =>
          component,
      },
    })

    t.mock.module('./NativeDOMRenderer', {
      namedExports: {
        NativeDOMRenderer: ({ onLoad }: { onLoad: () => void }) => {
          React.useEffect(() => {
            onLoad()
          }, [onLoad])

          return null
        },
      },
    })

    t.mock.module('./FullWidthViewport', {
      namedExports: {
        FullWidthViewport: ({ children }: React.PropsWithChildren) => (
          <>{children}</>
        ),
      },
    })

    t.mock.module('./ScaleToFitViewport', {
      namedExports: {
        ScaleToFitViewport: ({ children }: React.PropsWithChildren) => (
          <>{children}</>
        ),
      },
    })

    t.mock.module('./InteractionMask', {
      namedExports: {
        InteractionMask: () => null,
      },
    })

    t.mock.module('./PointerOverlay', {
      namedExports: {
        PointerOverlay: () => null,
      },
    })

    t.mock.module('./PointerTrail', {
      namedExports: {
        PointerTrail: () => null,
      },
    })

    const { PlaybackCanvas } = await import('./PlaybackCanvas.js')

    const { container } = render(
      <PlaybackCanvas
        interactive={false}
        trackPointer={false}
        trackScroll={false}
        scaling="scale-to-fit"
      />
    )

    expect(container.querySelector('[title="Enter fullscreen"]')).toBeNull()
    expect(container.querySelector('[title="Exit fullscreen"]')).toBeNull()
  })
})
