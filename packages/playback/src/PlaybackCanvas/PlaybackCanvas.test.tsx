import { cleanup, fireEvent, render } from '@testing-library/react'
import expect from 'expect'
import { afterEach, describe, it } from 'node:test'
import React from 'react'
import { BehaviorSubject } from 'rxjs'

describe('PlaybackCanvas fullscreen', () => {
  afterEach(() => {
    cleanup()
  })

  it('enters and exits fullscreen', async t => {
    const playback = {
      $elapsed: new BehaviorSubject(0),
      $latestEventTime: new BehaviorSubject(0),
      getDuration: () => 10,
    }

    let fullscreenElement: Element | null = null
    const requestFullscreen = function (this: Element) {
      fullscreenElement = this
      document.dispatchEvent(new window.Event('fullscreenchange'))
      return Promise.resolve()
    }
    const exitFullscreen = () => {
      fullscreenElement = null
      document.dispatchEvent(new window.Event('fullscreenchange'))
      return Promise.resolve()
    }

    Object.defineProperty(document, 'fullscreenElement', {
      configurable: true,
      get: () => fullscreenElement,
    })
    Object.defineProperty(document, 'exitFullscreen', {
      configurable: true,
      value: exitFullscreen,
    })
    Object.defineProperty(HTMLElement.prototype, 'requestFullscreen', {
      configurable: true,
      value: requestFullscreen,
    })

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

    t.mock.module('../PlaybackTimeline', {
      namedExports: {
        SimpleTimeline: () => <div data-testid="fullscreen-controls" />,
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

    const { PlaybackCanvas } = await import('./PlaybackCanvas.js')

    const { container } = render(
      <PlaybackCanvas
        interactive={false}
        trackPointer={false}
        trackScroll={false}
        scaling="scale-to-fit"
      />
    )

    const enterButton = container.querySelector('[title="Enter fullscreen"]')
    expect(enterButton).not.toBeNull()

    fireEvent.click(enterButton as Element)

    expect(document.fullscreenElement).not.toBeNull()
    expect(
      container.querySelector('[data-testid="fullscreen-controls"]')
    ).not.toBeNull()
    expect(container.querySelector('[title="Exit fullscreen"]')).not.toBeNull()

    const exitButton = container.querySelector('[title="Exit fullscreen"]')
    fireEvent.click(exitButton as Element)

    expect(document.fullscreenElement).toBeNull()
    expect(
      container.querySelector('[data-testid="fullscreen-controls"]')
    ).toBeNull()
  })
})
