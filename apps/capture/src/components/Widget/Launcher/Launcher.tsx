import { Block, Row } from '@jsxstyle/react'
import { animated, useTransition } from '@react-spring/web'
import { color, Logo, spacing, Tooltip } from '@repro/design'
import { RecordingMode } from '@repro/domain'
import { XIcon } from 'lucide-react'
import React from 'react'
import { ReadyState, useReadyState, useRecordingMode } from '~/state'
interface DevBadgeProps {
  branch: string
}

// DevBadge renders a small identifier chip over the Launcher in non-production
// builds, showing which branch/worktree built the extension. Production builds
// have this component tree-shaken out entirely via the BUILD_ENV guard below.
const DevBadge: React.FC<DevBadgeProps> = ({ branch }) => {
  const issueId = branch.match(/([A-Z]+-\d+)/i)?.[1]?.toUpperCase() ?? null
  const label = issueId ?? branch.split('/').pop()?.slice(0, 10) ?? 'dev'

  return (
    <Block
      position="absolute"
      bottom={-8}
      left="50%"
      transform="translateX(-50%)"
      backgroundColor={color.warningEmphasis}
      color={color.text.default}
      fontSize={9}
      fontWeight={700}
      fontFamily="monospace"
      paddingH={spacing.sm}
      paddingV={spacing.xs}
      borderRadius={3}
      whiteSpace="nowrap"
      pointerEvents="none"
      userSelect="none"
    >
      {label}
    </Block>
  )
}

export const Launcher: React.FC = () => {
  const [recordingMode, setRecordingMode] = useRecordingMode()
  const [, setReadyState] = useReadyState()

  const transitions = useTransition(recordingMode !== RecordingMode.None, {
    from: { opacity: 0, scale: 0.5, rotate: 45 },
    enter: { opacity: 1, scale: 1, rotate: 0 },
    leave: { opacity: 0, scale: 0.5, rotate: 45 },
  })

  // function onUseLive() {
  //   setReadyState(ReadyState.Pending)
  //   setRecordingMode(RecordingMode.Live)
  // }

  function onUseReplay() {
    setReadyState(ReadyState.Ready)
    setRecordingMode(RecordingMode.Replay)
  }

  function onReset() {
    setReadyState(ReadyState.Idle)
    setRecordingMode(RecordingMode.None)
  }

  function onClick() {
    if (recordingMode === RecordingMode.None) {
      onUseReplay()
    } else {
      onReset()
    }
  }

  return (
    <Row
      position="relative"
      alignItems="center"
      justifyContent="center"
      gap={spacing.lg}
      height={60}
      width={60}
      backgroundColor={color.primaryHover}
      backgroundImage={`linear-gradient(to bottom right, ${color.infoFg}, ${color.primary})`}
      hoverBackgroundColor={color.primaryHover}
      hoverBackgroundImage="none"
      borderRadius={8}
      border={`1px solid ${color.infoFg}`}
      boxShadow="0 0 16px rgba(0, 0, 0, 0.15)"
      scale={1}
      activeScale={0.9}
      translate="20px -20px"
      cursor="pointer"
      transition="all 100ms ease-in-out"
      onClick={onClick}
    >
      {recordingMode === RecordingMode.None && (
        <Tooltip position="right">Debug with Repro</Tooltip>
      )}

      <Block position="relative" width={28} height={28}>
        {transitions((style, active) => {
          if (active) {
            return (
              <animated.div style={{ ...style, position: 'absolute' }}>
                <XIcon size={28} color={color.text.inverse} />
              </animated.div>
            )
          }

          return (
            <animated.div style={{ ...style, position: 'absolute' }}>
              <Logo size={28} iconOnly inverted />
            </animated.div>
          )
        })}
      </Block>

      {process.env.BUILD_ENV !== 'production' && (
        <DevBadge branch={process.env.GIT_BRANCH} />
      )}
    </Row>
  )
}
