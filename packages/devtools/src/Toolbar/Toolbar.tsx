import { Block, Row } from '@jsxstyle/react'
import { IfGate } from '@repro/auth'
import { color } from '@repro/design'
import { PlaybackNavigation, SimpleTimeline } from '@repro/playback'
import {
  Maximize2 as EnterFullscreenIcon,
  Minimize2 as ExitFullscreenIcon,
} from 'lucide-react'
import React from 'react'
import { Picker } from './Picker'
import { Tabs } from './Tabs'
import { Toggle } from './Toggle'

interface Props {
  timeline?: React.ReactNode
  fullscreen: boolean
  onToggleFullscreen: () => void
}

export const Toolbar: React.FC<Props> = ({
  fullscreen,
  onToggleFullscreen,
  timeline,
}) => {
  return (
    <Container>
      <Toggle />
      <Separator />
      <Picker />
      <Separator />
      <Tabs />
      <Separator />

      <TimelineRegion>{timeline ?? <SimpleTimeline />}</TimelineRegion>

      <IfGate gate="breakpoints">
        <Separator />
        <PlaybackNavigation />
      </IfGate>

      <Separator />
      <FullscreenToggle
        fullscreen={fullscreen}
        onToggleFullscreen={onToggleFullscreen}
      />
    </Container>
  )
}

const Container: React.FC<{ children?: React.ReactNode }> = ({ children }) => (
  <Row alignItems="stretch">{children}</Row>
)

const Separator: React.FC<{}> = () => (
  <Block
    alignSelf="center"
    backgroundColor={color.border.default}
    height="calc(100% - 20px)"
    width={1}
  />
)

const TimelineRegion: React.FC<{ children?: React.ReactNode }> = ({
  children,
}) => (
  <Block flex={1} marginV={5} marginH={16}>
    {children}
  </Block>
)

const FullscreenToggle: React.FC<{
  fullscreen: boolean
  onToggleFullscreen: () => void
}> = ({ fullscreen, onToggleFullscreen }) => {
  const label = fullscreen ? 'Exit fullscreen' : 'Enter fullscreen'

  return (
    <Row position="relative" alignItems="center" cursor="pointer" paddingH={4}>
      <Row
        alignItems="center"
        justifyContent="center"
        width={32}
        height={32}
        hoverBackgroundColor={color.bg.hover}
        color={color.primary}
        borderRadius={4}
        title={label}
        props={{
          onClick: onToggleFullscreen,
          'aria-label': label,
        }}
      >
        {fullscreen ? (
          <ExitFullscreenIcon size={14} />
        ) : (
          <EnterFullscreenIcon size={14} />
        )}
      </Row>
    </Row>
  )
}
