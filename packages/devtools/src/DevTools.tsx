import { Block, Grid } from '@jsxstyle/react'
import { Analytics } from '@repro/analytics'
import { ReferenceStyleProvider } from '@repro/css-utils'
import { color } from '@repro/design'
import { PlaybackCanvas } from '@repro/playback'
import React, {
  Fragment,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react'
import { ConsolePanel } from './ConsolePanel'
import { DragHandle } from './DragHandle'
import { ElementsPanel } from './ElementsPanel'
import { NetworkPanel } from './NetworkPanel'
import { PickerOverlay } from './PickerOverlay'
import { ReactPanel } from './ReactPanel'
import { ReduxPanel } from './ReduxPanel'
import { Toolbar } from './Toolbar'
import { MAX_INT32 } from './constants'
import {
  useCurrentDocument,
  useDevToolsView,
  useElementPicker,
  useInspecting,
  useMask,
  useNodeMap,
  useSize,
} from './hooks'
import { View } from './types'

interface Props {
  hideInspectorOnOpen?: boolean
  timeline?: React.ReactNode
  resourceBaseURL?: string
}

export const DevTools = React.memo<Props>(props => {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [, setCurrentDocument] = useCurrentDocument()
  const [, setNodeMap] = useNodeMap()
  const [inspecting, setInspecting] = useInspecting()
  const [picker] = useElementPicker()
  const [mask] = useMask()
  const [view] = useDevToolsView()
  const [isFullscreen, setIsFullscreen] = useState(false)

  const isShellFullscreen = useCallback(
    () => document.fullscreenElement !== null,
    []
  )

  const updateFullscreenState = useCallback(() => {
    setIsFullscreen(isShellFullscreen())
  }, [isShellFullscreen])

  const toggleFullscreen = useCallback(() => {
    const container = containerRef.current

    if (!container) {
      return
    }

    if (isShellFullscreen()) {
      void document.exitFullscreen()
      return
    }

    void container.requestFullscreen()
  }, [isShellFullscreen])

  useEffect(() => {
    if (props.hideInspectorOnOpen) {
      setInspecting(false)
    }
  }, [props.hideInspectorOnOpen])

  useEffect(() => {
    if (inspecting) {
      Analytics.track('inspect:open-devtools')
    }
  }, [inspecting])

  useEffect(() => {
    if (picker) {
      Analytics.track('inspect:use-picker')
    }
  }, [picker])

  useEffect(() => {
    updateFullscreenState()

    document.addEventListener('fullscreenchange', updateFullscreenState)

    return () => {
      document.removeEventListener('fullscreenchange', updateFullscreenState)
    }
  }, [updateFullscreenState])

  return (
    <Container containerRef={containerRef}>
      <ReferenceStyleProvider>
        <PlaybackRegion mask={mask}>
          <PlaybackCanvas
            interactive={false}
            trackPointer={true}
            trackScroll={true}
            scaling="scale-to-fit"
            resourceBaseURL={props.resourceBaseURL}
            onDocumentReady={setCurrentDocument}
            onLoad={setNodeMap}
          >
            <PickerOverlay />
          </PlaybackCanvas>
        </PlaybackRegion>

        <InspectorRegion>
          <Toolbar
            timeline={props.timeline}
            fullscreen={isFullscreen}
            onToggleFullscreen={toggleFullscreen}
          />

          {inspecting && (
            <Fragment>
              <DragHandle />
              <ContentRegion>
                {view === View.Elements && <ElementsPanel />}
                {view === View.Network && <NetworkPanel />}
                {view === View.Console && <ConsolePanel />}
                {view === View.React && <ReactPanel />}
                {view === View.Redux && <ReduxPanel />}
              </ContentRegion>
            </Fragment>
          )}
        </InspectorRegion>
      </ReferenceStyleProvider>
    </Container>
  )
})

const Container: React.FC<{
  children?: React.ReactNode
  containerRef: React.RefObject<HTMLDivElement>
}> = ({ children, containerRef }) => (
  <Grid
    height="100%"
    gridTemplateRows="1fr auto"
    gridTemplateAreas={`"playback" "inspector"`}
    pointerEvents="auto"
    overflow="hidden"
    props={{ ref: containerRef }}
  >
    {children}
  </Grid>
)

const PlaybackRegion: React.FC<{
  children?: React.ReactNode
  mask: boolean
}> = ({ children, mask }) => (
  <Block
    height="100%"
    overflow="hidden"
    position="relative"
    gridArea="playback"
    pointerEvents={mask ? 'none' : 'all'}
    backgroundColor={color.bg.surface}
  >
    {children}
  </Block>
)

const InspectorRegion: React.FC<{ children?: React.ReactNode }> = ({
  children,
}) => (
  <Grid
    gridArea="inspector"
    position="relative"
    backgroundColor={color.bg.surface}
    gridTemplateRows="40px auto"
    boxShadow={`0 -4px 16px rgba(0, 0, 0, 0.1)`}
    zIndex={MAX_INT32}
  >
    {children}
  </Grid>
)

const ContentRegion: React.FC<{ children?: React.ReactNode }> = ({
  children,
}) => {
  const [size] = useSize()
  return (
    <Block
      height={size}
      borderTopStyle="solid"
      borderTopWidth={1}
      borderTopColor={color.border.strong}
      overflow="auto"
    >
      {children}
    </Block>
  )
}
