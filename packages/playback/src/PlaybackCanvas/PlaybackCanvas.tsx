import { Block, Row } from '@jsxstyle/react'
import { colors, Delay, FrameRealm, FX } from '@repro/design'
import { Loader as LoaderIcon } from 'lucide-react'
import React, {
  MutableRefObject,
  PropsWithChildren,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react'
import { asyncScheduler, combineLatest, observeOn } from 'rxjs'
import { usePlayback } from '..'
import { withPlaybackErrorBoundary } from '../PlaybackErrorBoundary'
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

export const PlaybackCanvas = withPlaybackErrorBoundary<
  PropsWithChildren<Props>
>(
  ({
    children,
    interactive,
    trackPointer,
    trackScroll,
    scaling,
    resourceBaseURL,
    onDocumentReady,
    onLoad,
  }) => {
    const playback = usePlayback()
    const frameRef = useRef() as MutableRefObject<HTMLIFrameElement>
    const [ownerDocument, setOwnerDocument] = useState<Document | null>(null)

    const [loaded, setLoaded] = useState(false)
    const [waitingForEvents, setWaitingForEvents] = useState(true)

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
        <FrameRealm ref={frameRef}>
          <Delay>
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
        overflow="hidden"
        height="100%"
        userSelect={interactive ? 'all' : 'none'}
        background={`repeating-linear-gradient(
          45deg,
          ${colors.slate['50']},
          ${colors.slate['50']} 10px,
          ${colors.slate['100']} 10px,
          ${colors.slate['100']} 20px
        )`}
      >
        {(!loaded || waitingForEvents) && (
          <Row alignItems="center" justifyContent="center" height="100%">
            <FX.Spin height={24} color={colors.slate['500']}>
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
      </Block>
    )
  }
)
