import { Block, Row } from '@jsxstyle/react'
import { Loading } from '@repro/agentic'
import {
  /* eslint-disable @repro/oxlint-plugin-design/no-hardcoded-color */
  color,
  fontFamily,
  fontSize,
  FX,
  spacing,
  transition,
} from '@repro/design'
import { CircleIcon, XIcon } from 'lucide-react'
import React, { useEffect, useRef, useState } from 'react'

interface LoadingIndicatorProps {
  loading: Loading
  onCancel?: () => void
}

export const LoadingIndicator: React.FC<LoadingIndicatorProps> = ({
  loading,
  onCancel,
}) => {
  // Keep the last non-"none" loading value so the exit animation
  // doesn't flash a blank/wrong state while the pill slides away.
  const prevLoadingRef = useRef<Loading>(loading)
  const [displayLoading, setDisplayLoading] = useState<Loading>(loading)

  useEffect(() => {
    if (loading !== 'none') {
      prevLoadingRef.current = loading
      setDisplayLoading(loading)
      return
    }
    // "none" means the pill is exiting. Keep showing whatever was last visible
    // until the CSS transition completes (250ms), then switch to "none".
    const timer = setTimeout(() => {
      setDisplayLoading('none')
    }, 250)
    return () => clearTimeout(timer)
  }, [loading])

  const isHidden = displayLoading === 'none'
  const isCancelled = displayLoading === 'cancelled'

  // State-specific labels give users a meaningful signal at each phase.
  const stateLabel: Record<Exclude<Loading, 'none' | 'cancelled'>, string> = {
    reasoning: 'Thinking…',
    responding: 'Responding…',
    'tool-executing': 'Analysing…',
  }

  const label =
    displayLoading !== 'none' && displayLoading !== 'cancelled'
      ? stateLabel[displayLoading]
      : null

  return (
    <Row
      alignItems="center"
      backgroundColor={isCancelled ? color.neutral : color.primaryHover}
      backgroundImage={
        isCancelled
          ? `linear-gradient(to bottom right, ${color.neutral}, ${color.neutralHover})`
          : `linear-gradient(to bottom right, ${color.infoFg}, ${color.primary})`
      }
      borderRadius="99em"
      bottom={0}
      boxShadow={isHidden ? 'none' : '0 0 16px rgba(0, 0, 0, 0.15)'}
      left="50%"
      position="absolute"
      translate={isHidden ? `-50% calc(100% + 20px)` : `-50% -20px`}
      transition="all ease-in-out 250ms"
      overflow="clip"
    >
      {isCancelled ? (
        // Brief cancellation confirmation label — no dots, no cancel button
        <Block
          color={color.text.inverse}
          fontFamily={fontFamily.sans}
          fontSize={fontSize.xs}
          paddingBlock={spacing.md}
          paddingInline={spacing.lg}
        >
          Cancelled
        </Block>
      ) : (
        <>
          <Row
            gap={spacing.xs}
            paddingBlock={spacing.md}
            paddingInline={spacing.lg}
          >
            <FX.Pulse>
              <CircleIcon
                size={8}
                fill={color.text.inverse}
                stroke={color.text.inverse}
              />
            </FX.Pulse>

            <FX.Pulse animationDelay="100ms">
              <CircleIcon
                size={8}
                fill={color.text.inverse}
                stroke={color.text.inverse}
              />
            </FX.Pulse>

            <FX.Pulse animationDelay="200ms">
              <CircleIcon
                size={8}
                fill={color.text.inverse}
                stroke={color.text.inverse}
              />
            </FX.Pulse>
          </Row>

          {label && (
            <Block
              color={color.text.inverse}
              fontFamily={fontFamily.sans}
              fontSize={fontSize.xs}
              paddingInlineEnd={spacing.lg}
            >
              {label}
            </Block>
          )}

          {onCancel && (
            <>
              {/* Faint separator */}
              <Block
                alignSelf="stretch"
                backgroundColor="rgba(255, 255, 255, 0.25)"
                width={1}
              />

              {/* Cancel X button */}
              <Block
                alignItems="center"
                background="none"
                border="none"
                color={color.text.inverse}
                component="button"
                cursor="pointer"
                display="flex"
                justifyContent="center"
                lineHeight={1}
                paddingBlock={spacing.md}
                paddingInline={spacing.lg}
                transition={transition.fast}
                hoverBackgroundColor={color.primary}
                props={{
                  type: 'button',
                  'aria-label': 'Cancel',
                  onClick: onCancel,
                }}
              >
                <XIcon size={12} />
              </Block>
            </>
          )}
        </>
      )}
    </Row>
  )
}
/* eslint-enable */
