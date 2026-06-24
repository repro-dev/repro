import { Block, Row } from '@jsxstyle/react'
import {
  color,
  duration,
  easing,
  lineHeight,
  radius,
  shadow,
  spacing,
  textStyles,
} from '@repro/design'
import {
  ChevronLeft as ChevronLeftIcon,
  ChevronRight as ChevronRightIcon,
  Pause as PauseIcon,
  Play as PlayIcon,
  SkipBack as SkipBackIcon,
  SkipForward as SkipForwardIcon,
} from 'lucide-react'
import React, { useEffect, useState } from 'react'
import {
  PlaybackHudAction,
  PlaybackHudOverlayItem,
  usePlaybackHud,
  usePlaybackHudOverlays,
} from './PlaybackHudContext'

const TRANSITION = `opacity ${duration['1000']} ${easing.default}, transform ${duration['1000']} ${easing.default}`
const ARROW_TRANSITION = `transform ${duration['300']} ${easing.default}`

function getPositionStyle(action: PlaybackHudAction) {
  switch (action) {
    case 'play':
    case 'pause':
      return { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }
    case 'seek-backward':
    case 'seek-to-start':
      return {
        top: '50%',
        left: '25%',
        transform: 'translateY(-50%)',
      }
    case 'seek-forward':
    case 'seek-to-end':
      return {
        top: '50%',
        right: '25%',
        transform: 'translateY(-50%)',
      }
    case 'speed-up':
    case 'speed-down':
      return { top: spacing.lg, right: spacing.lg }
  }
}

function getIconShift(
  action: PlaybackHudAction,
  visible: boolean
): string | undefined {
  if (visible) {
    return undefined
  }

  switch (action) {
    case 'seek-backward':
      return 'translateX(-10px)'
    case 'seek-forward':
      return 'translateX(10px)'
    default:
      return undefined
  }
}

interface HudBadgeProps {
  overlay: PlaybackHudOverlayItem
}

const HudBadge: React.FC<HudBadgeProps> = ({ overlay }) => {
  const { dismissHud } = usePlaybackHud()
  const [visible, setVisible] = useState(true)

  useEffect(() => {
    setVisible(false)
  }, [])

  const positionStyle = getPositionStyle(overlay.action)

  const iconShift = getIconShift(overlay.action, visible)

  const content = (() => {
    switch (overlay.action) {
      case 'play':
        return (
          <Block
            transform={iconShift}
            transition={TRANSITION}
            lineHeight={lineHeight.none}
          >
            <PlayIcon size={40} />
          </Block>
        )
      case 'pause':
        return (
          <Block
            transform={iconShift}
            transition={TRANSITION}
            lineHeight={lineHeight.none}
          >
            <PauseIcon size={40} />
          </Block>
        )
      case 'seek-backward':
        return (
          <>
            <Block
              transform={iconShift}
              transition={ARROW_TRANSITION}
              lineHeight={lineHeight.none}
            >
              <ChevronLeftIcon size={28} />
            </Block>
            -5s
          </>
        )
      case 'seek-forward':
        return (
          <>
            +5s
            <Block
              transform={iconShift}
              transition={ARROW_TRANSITION}
              lineHeight={lineHeight.none}
            >
              <ChevronRightIcon size={28} />
            </Block>
          </>
        )
      case 'seek-to-start':
        return (
          <Block
            transform={iconShift}
            transition={TRANSITION}
            lineHeight={lineHeight.none}
          >
            <SkipBackIcon size={40} />
          </Block>
        )
      case 'seek-to-end':
        return (
          <Block
            transform={iconShift}
            transition={TRANSITION}
            lineHeight={lineHeight.none}
          >
            <SkipForwardIcon size={40} />
          </Block>
        )
      case 'speed-up':
      case 'speed-down':
        return `${(overlay.meta?.speed ?? 1).toFixed(1)}x`
    }
  })()

  return (
    <Row
      position="absolute"
      alignItems="center"
      justifyContent="center"
      gap={spacing.md}
      padding={spacing.xl}
      backgroundColor={`color-mix(in srgb, ${color.bg.emphasis}, transparent 25%)`}
      color={color.text.inverse}
      borderRadius={radius.lg}
      boxShadow={shadow.md}
      opacity={visible ? 1 : 0}
      transition={TRANSITION}
      {...textStyles.heading1}
      {...positionStyle}
      props={{
        'aria-hidden': true,
        onTransitionEnd: () => dismissHud(overlay.id),
      }}
    >
      {content}
    </Row>
  )
}

export const PlaybackHudOverlay: React.FC = () => {
  const overlays = usePlaybackHudOverlays()

  if (overlays.length === 0) {
    return null
  }

  return (
    <Block
      position="absolute"
      top={0}
      left={0}
      bottom={0}
      right={0}
      pointerEvents="none"
      props={{ 'aria-hidden': true }}
    >
      {overlays.map(overlay => (
        <HudBadge key={overlay.id} overlay={overlay} />
      ))}
    </Block>
  )
}
