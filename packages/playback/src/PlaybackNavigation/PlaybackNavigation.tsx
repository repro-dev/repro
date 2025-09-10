import { Row } from '@jsxstyle/react'
import { Analytics } from '@repro/analytics'
import { colors, Tooltip } from '@repro/design'
import { BugOffIcon, StepBackIcon, StepForwardIcon } from 'lucide-react'
import React from 'react'
import {
  useActiveBreakpoint,
  useBreakpoints,
  useBreakpointsEnabled,
  usePlayback,
} from '../hooks'
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

  function stepBack() {
    Analytics.track('playback:step-back')
    playback.breakPrevious()
  }

  // function stepBackOneFrame() {
  //   Analytics.track('playback:step-back-one-frame')
  //   // TODO: implement me
  // }

  function stepForward() {
    Analytics.track('playback:step-forward')
    playback.breakNext()
  }

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

  return (
    <Row paddingH={10} position="relative">
      {showFloatingControls && (
        <Row
          position="absolute"
          top={0}
          right={0}
          transform="translate(-10px, calc(-100% - 10px))"
          padding={5}
          backgroundColor={colors.white}
          borderWidth={1}
          borderStyle="solid"
          borderColor={colors.slate['300']}
          boxShadow={`0 2px 4px ${colors.slate['200']}`}
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
