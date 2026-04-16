import { Row } from '@jsxstyle/react'
import { Analytics } from '@repro/analytics'
import { color, shadow, Tooltip } from '@repro/design'
import { BugOffIcon, StepBackIcon, StepForwardIcon } from 'lucide-react'
import React, { useCallback, useMemo } from 'react'
import {
  useActiveBreakpoint,
  useBreakpoints,
  useBreakpointsEnabled,
  usePlayback,
} from '../hooks'
import { usePlaybackShortcuts } from '../hooks/usePlaybackShortcuts'
import { Button } from './Button.styles'

export const PlaybackNavigation: React.FC = () => {
  const playback = usePlayback()

  const breakpoints = useBreakpoints()
  const hasBreakpoints = breakpoints.length > 0

  const activeBreakpoint = useActiveBreakpoint()
  const showFloatingControls = activeBreakpoint !== null

  const breakpointsEnabled = useBreakpointsEnabled()

  // function clearBreakpoints() {
  //   Analytics.track('playback:clear-breakpoints')
  //   playback.clearBreakpoints()
  // }

  const stepBack = useCallback(() => {
    Analytics.track('playback:step-back')
    playback.breakPrevious()
  }, [playback])

  // function stepBackOneFrame() {
  //   Analytics.track('playback:step-back-one-frame')
  //   // TODO: implement me
  // }

  const stepForward = useCallback(() => {
    Analytics.track('playback:step-forward')
    playback.breakNext()
  }, [playback])

  // function stepForwardOneFrame() {
  //   Analytics.track('playback:step-forward-one-frame')
  //   // TODO: implement me
  // }

  function toggleBreakpoints() {
    if (breakpointsEnabled) {
      playback.disableBreakpoints()
    } else {
      playback.enableBreakpoints()
    }
  }

  // Number key seek handlers: key n seeks to n/10 of total duration.
  // Digits use single-character identifiers per the shortcuts library format.
  const seekTo0 = useCallback(() => playback.seekToTime(0), [playback])
  const seekTo1 = useCallback(
    () => playback.seekToTime(playback.getDuration() * 0.1),
    [playback]
  )
  const seekTo2 = useCallback(
    () => playback.seekToTime(playback.getDuration() * 0.2),
    [playback]
  )
  const seekTo3 = useCallback(
    () => playback.seekToTime(playback.getDuration() * 0.3),
    [playback]
  )
  const seekTo4 = useCallback(
    () => playback.seekToTime(playback.getDuration() * 0.4),
    [playback]
  )
  const seekTo5 = useCallback(
    () => playback.seekToTime(playback.getDuration() * 0.5),
    [playback]
  )
  const seekTo6 = useCallback(
    () => playback.seekToTime(playback.getDuration() * 0.6),
    [playback]
  )
  const seekTo7 = useCallback(
    () => playback.seekToTime(playback.getDuration() * 0.7),
    [playback]
  )
  const seekTo8 = useCallback(
    () => playback.seekToTime(playback.getDuration() * 0.8),
    [playback]
  )
  const seekTo9 = useCallback(
    () => playback.seekToTime(playback.getDuration() * 0.9),
    [playback]
  )
  const seekToStart = useCallback(() => playback.seekToTime(0), [playback])
  const seekToEnd = useCallback(
    () => playback.seekToTime(playback.getDuration()),
    [playback]
  )

  // TODO(REP-531): add F → toggle fullscreen once fullscreen API is implemented
  // Note: keyboard shortcuts in the parent document won't fire when focus is
  // inside the playback <iframe> (FrameRealm). This is an architectural limit.
  const shortcutEntries = useMemo(
    () => [
      { shortcut: 'Left', handler: stepBack },
      { shortcut: 'Right', handler: stepForward },
      { shortcut: '0', handler: seekTo0 },
      { shortcut: '1', handler: seekTo1 },
      { shortcut: '2', handler: seekTo2 },
      { shortcut: '3', handler: seekTo3 },
      { shortcut: '4', handler: seekTo4 },
      { shortcut: '5', handler: seekTo5 },
      { shortcut: '6', handler: seekTo6 },
      { shortcut: '7', handler: seekTo7 },
      { shortcut: '8', handler: seekTo8 },
      { shortcut: '9', handler: seekTo9 },
      { shortcut: 'Home', handler: seekToStart },
      { shortcut: 'End', handler: seekToEnd },
    ],
    [
      stepBack,
      stepForward,
      seekTo0,
      seekTo1,
      seekTo2,
      seekTo3,
      seekTo4,
      seekTo5,
      seekTo6,
      seekTo7,
      seekTo8,
      seekTo9,
      seekToStart,
      seekToEnd,
    ]
  )

  usePlaybackShortcuts(shortcutEntries)

  return (
    <Row paddingH={10} position="relative">
      {showFloatingControls && (
        <Row
          position="absolute"
          top={0}
          right={0}
          transform="translate(-10px, calc(-100% - 10px))"
          padding={5}
          backgroundColor={color.bg.surface}
          borderWidth={1}
          borderStyle="solid"
          borderColor={color.border.strong}
          boxShadow={shadow.sm}
        >
          <Button onClick={stepBack}>
            <StepBackIcon size={16} />
          </Button>

          <Button onClick={stepForward}>
            <StepForwardIcon size={16} />
          </Button>
        </Row>
      )}

      <Button
        active={!breakpointsEnabled}
        disabled={!hasBreakpoints}
        onClick={toggleBreakpoints}
      >
        <BugOffIcon size={16} />
        <Tooltip position="left">
          {breakpointsEnabled ? 'Disable breakpoints' : 'Enable breakpoints'}
        </Tooltip>
      </Button>
    </Row>
  )
}
