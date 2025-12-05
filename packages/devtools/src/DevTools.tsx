import { Block, Grid } from '@jsxstyle/react'
import { Analytics } from '@repro/analytics'
import { ReferenceStyleProvider } from '@repro/css-utils'
import { colors } from '@repro/design'
import { PlaybackCanvas } from '@repro/playback'
import React, { Fragment, PropsWithChildren, useEffect } from 'react'
import { ConsolePanel } from './ConsolePanel'
import { DragHandle } from './DragHandle'
import { ElementsPanel } from './ElementsPanel'
import { NetworkPanel } from './NetworkPanel'
import { PickerOverlay } from './PickerOverlay'
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

export const DevTools: React.FC<Props> = React.memo(props => {
  const [, setCurrentDocument] = useCurrentDocument()
  const [, setNodeMap] = useNodeMap()
  const [inspecting, setInspecting] = useInspecting()
  const [picker] = useElementPicker()
  const [mask] = useMask()
  const [view] = useDevToolsView()

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

  return (
    <Container>
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
          <Toolbar timeline={props.timeline} />

          {inspecting && (
            <Fragment>
              <DragHandle />
              <ContentRegion>
                {view === View.Elements && <ElementsPanel />}
                {view === View.Network && <NetworkPanel />}
                {view === View.Console && <ConsolePanel />}
              </ContentRegion>
            </Fragment>
          )}
        </InspectorRegion>
      </ReferenceStyleProvider>
    </Container>
  )
})

const Container: React.FC<PropsWithChildren> = ({ children }) => (
  <Grid
    height="100%"
    gridTemplateRows="1fr auto"
    gridTemplateAreas={`"playback" "inspector"`}
    pointerEvents="auto"
    overflow="hidden"
  >
    {children}
  </Grid>
)

const PlaybackRegion: React.FC<PropsWithChildren<{ mask: boolean }>> = ({
  children,
  mask,
}) => (
  <Block
    height="100%"
    overflow="hidden"
    position="relative"
    gridArea="playback"
    pointerEvents={mask ? 'none' : 'all'}
    backgroundColor={colors.white}
  >
    {children}
  </Block>
)

const InspectorRegion: React.FC<PropsWithChildren> = ({ children }) => (
  <Grid
    gridArea="inspector"
    position="relative"
    isolation="isolate"
    backgroundColor={colors.white}
    gridTemplateRows="40px auto"
    boxShadow={`0 -4px 16px rgba(0, 0, 0, 0.1)`}
    zIndex={MAX_INT32}
  >
    {children}
  </Grid>
)

const ContentRegion: React.FC<PropsWithChildren> = ({ children }) => {
  const [size] = useSize()
  return (
    <Block
      height={size}
      borderTopStyle="solid"
      borderTopWidth={1}
      borderTopColor={colors.slate['300']}
      overflow="auto"
    >
      {children}
    </Block>
  )
}
