import { Block, Row } from '@jsxstyle/react'
import { color, Delay, FrameRealm, FX } from '@repro/design'
import { Loader as LoaderIcon } from 'lucide-react'
import React, { useCallback, useEffect, useRef, useState } from 'react'
import { asyncScheduler, combineLatest, observeOn } from 'rxjs'
import { usePlayback } from '..'
import { withPlaybackErrorBoundary } from '../PlaybackErrorBoundary'
import { Button } from '../PlaybackNavigation/Button.styles'
import { SimpleTimeline } from '../PlaybackTimeline'
import { FullWidthViewport } from './FullWidthViewport'
import { InteractionMask } from './InteractionMask'
import { NativeDOMRenderer } from './NativeDOMRenderer'
import { PointerOverlay } from './PointerOverlay'
import { ScaleToFitViewport } from './ScaleToFitViewport'
import { MutableNodeMap } from './types'

interface Props {
  interactive: boolean
  trackPointer: boolean
  trackScroll: boolean
  scaling: 'full-width' | 'scale-to-fit'
  resourceBaseURL?: string
  onDocumentReady?: (doc: Document) => void
  onLoad?: (nodeMap: MutableNodeMap) => void
}

export const PlaybackCanvas = withPlaybackErrorBoundary(
  ({
    children,
    interactive,
    trackPointer,
    trackScroll,
    scaling,
    resourceBaseURL,
    onDocumentReady,
    onLoad,
  }: Props & { children?: React.ReactNode }) => {
    const playback = usePlayback()
    const frameRef = useRef<HTMLIFrameElement | null>(null)
    const containerRef = useRef<HTMLDivElement | null>(null)
    const [ownerDocument, setOwnerDocument] = useState<Document | null>(null)

    const [loaded, setLoaded] = useState(false)
    const [waitingForEvents, setWaitingForEvents] = useState(true)
    const [isFullscreen, setIsFullscreen] = useState(false)

    const updateFullscreenState = useCallback(() => {
      setIsFullscreen(document.fullscreenElement === containerRef.current)
    }, [])

    const toggleFullscreen = useCallback(() => {
      const container = containerRef.current

      if (!container) {
        return
      }

      if (document.fullscreenElement === container) {
        void document.exitFullscreen()
        return
      }

      void container.requestFullscreen()
    }, [])

    const handleLoad = useCallback(
      (nodeMap: MutableNodeMap) => {
        if (onLoad) {
          onLoad(nodeMap)
        }

        setLoaded(true)
      },
      [onLoad, setLoaded]
    )

    useEffect(() => {
      if (!frameRef.current) {
        setOwnerDocument(null)
        return
      }

      const contentDocument = frameRef.current.contentDocument
      setOwnerDocument(contentDocument)

      if (contentDocument && onDocumentReady) {
        onDocumentReady(contentDocument)
      }
    }, [frameRef, setOwnerDocument, onDocumentReady])

    useEffect(() => {
      updateFullscreenState()

      document.addEventListener('fullscreenchange', updateFullscreenState)

      return () => {
        document.removeEventListener('fullscreenchange', updateFullscreenState)
      }
    }, [updateFullscreenState])

    useEffect(() => {
      const subscription = combineLatest([
        playback.$elapsed,
        playback.$latestEventTime,
      ])
        .pipe(observeOn(asyncScheduler))
        .subscribe(([elapsed, latestEventTime]) => {
          setWaitingForEvents(
            elapsed < playback.getDuration() && elapsed > latestEventTime
          )
        })

      return () => {
        subscription.unsubscribe()
      }
    }, [playback, setWaitingForEvents])

    const viewportContents = (
      <React.Fragment>
        {/* Keep replayed DOM unfocusable only when playback is non-interactive */}
        <FrameRealm ref={frameRef} inert={interactive ? undefined : ''}>
          <Delay duration={500}>
            <NativeDOMRenderer
              trackScroll={trackScroll}
              ownerDocument={ownerDocument}
              resourceBaseURL={resourceBaseURL || undefined}
              onLoad={handleLoad}
            />
          </Delay>
        </FrameRealm>

        {trackPointer && <PointerOverlay />}
        {!interactive && <InteractionMask />}
        {children}
      </React.Fragment>
    )

    return (
      <Block
        position="relative"
        overflow="hidden"
        height="100%"
        width="100%"
        userSelect={interactive ? 'all' : 'none'}
        background={`repeating-linear-gradient(
          45deg,
          ${color.bg.subtle},
          ${color.bg.subtle} 10px,
          ${color.bg.hover} 10px,
          ${color.bg.hover} 20px
        )`}
        props={{ ref: containerRef }}
      >
        {!isFullscreen && (
          <Row position="absolute" top={12} right={12} zIndex={2}>
            <Button title="Enter fullscreen" onClick={toggleFullscreen}>
              Fullscreen
            </Button>
          </Row>
        )}

        {(!loaded || waitingForEvents) && (
          <Row alignItems="center" justifyContent="center" height="100%">
            <FX.Spin height={24} color={color.text.muted}>
              <LoaderIcon size={24} />
            </FX.Spin>
          </Row>
        )}

        {scaling === 'full-width' && (
          <FullWidthViewport>{viewportContents}</FullWidthViewport>
        )}

        {scaling === 'scale-to-fit' && (
          <ScaleToFitViewport>{viewportContents}</ScaleToFitViewport>
        )}

        {isFullscreen && (
          <Row
            position="absolute"
            left={12}
            right={12}
            bottom={12}
            alignItems="center"
            gap={12}
            padding={8}
            backgroundColor={color.bg.surface}
            borderWidth={1}
            borderStyle="solid"
            borderColor={color.border.default}
            borderRadius={8}
            boxShadow="0 8px 24px rgba(0, 0, 0, 0.18)"
            zIndex={2}
          >
            <Block flex={1} minWidth={0} height={36}>
              <SimpleTimeline />
            </Block>

            <Button title="Exit fullscreen" onClick={toggleFullscreen}>
              Exit
            </Button>
          </Row>
        )}
      </Block>
    )
  }
)
