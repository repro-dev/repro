import { Block, Col, Row } from '@jsxstyle/react'
import { buildInvestigationSummary, type RecordingMeta } from '@repro/agentic'
import { useAtomValue } from '@repro/atom'
import {
  AgenticInputFormState,
  color,
  focusRing,
  radius,
  spacing,
  Tooltip,
  transition,
} from '@repro/design'
import { RotateCcwIcon } from 'lucide-react'
import React, { useEffect, useRef, useState } from 'react'
import { AgenticInputSection } from './components/AgenticInputSection'
import { CopyForCodingAgentButton } from './components/CopyForCodingAgentButton'
import { HypothesisList } from './components/HypothesisList'
import { JumpToEndButton } from './components/JumpToEndButton'
import { LoadingIndicator } from './components/LoadingIndicator'
import { MessageList } from './components/MessageList'
import { useAgenticState } from './context'
import { useHistoryScroll } from './hooks/useHistoryScroll'

export const AgenticView: React.FC<{
  onFeedback?: (sentiment: 'positive' | 'negative') => void
  onGoToTime?: (timeMs: number) => void
  onInvestigationComplete?: (summary: string) => void
  recordingMeta?: RecordingMeta | null
}> = ({
  onFeedback,
  onGoToTime,
  onInvestigationComplete,
  recordingMeta = null,
}) => {
  const [inputHasFocus, setInputHasFocus] = useState(false)
  const lastSummaryRef = useRef('')

  const agentic = useAgenticState()
  const entries = useAtomValue(agentic.$entries)
  const loading = useAtomValue(agentic.$loading)
  const error = useAtomValue(agentic.$error)
  const wasCancelled = useAtomValue(agentic.$wasCancelled)
  const stage = useAtomValue(agentic.$stage)
  const hypotheses = useAtomValue(agentic.$hypotheses)

  const lastPromptRef = useRef('')

  const {
    scrollContainerRef,
    contentContainerRef,
    shouldShowJumpToEndAction,
    handleJumpToEnd,
  } = useHistoryScroll(loading, entries)

  const isActive = loading !== 'none' && loading !== 'cancelled'
  const shouldRaiseInput = inputHasFocus || entries.length > 0

  function handleSubmit({ value }: AgenticInputFormState) {
    lastPromptRef.current = value
    agentic.query(value)
    setInputHasFocus(false)
  }

  function handleRetry() {
    agentic.query(lastPromptRef.current)
  }

  function handleReset() {
    lastSummaryRef.current = ''
    agentic.reset()
    setInputHasFocus(false)
  }

  // Fire onInvestigationComplete when the investigation reaches conclusion
  useEffect(() => {
    if (
      stage === 'conclusion' &&
      hypotheses.length > 0 &&
      onInvestigationComplete
    ) {
      const summary = buildInvestigationSummary(hypotheses)
      if (summary !== lastSummaryRef.current) {
        lastSummaryRef.current = summary
        onInvestigationComplete(summary)
      }
    }
  }, [stage, hypotheses, onInvestigationComplete])

  return (
    <Block
      blockSize={`calc(100% + ${spacing['2xl']}px + ${spacing['2xl']}px)`}
      containerType="size"
      marginBlockStart={`-${spacing['2xl']}px`}
      position="relative"
    >
      <Col height="100%" overflow="hidden" marginInline={-spacing['2xl']}>
        {entries.length > 0 && (
          <Row
            position="sticky"
            top={0}
            zIndex={2}
            justifyContent="space-between"
            alignItems="center"
            padding={spacing.sm}
            paddingInline={spacing.xl}
            background={color.bg.surface}
          >
            <Block
              alignItems="center"
              background="transparent"
              border="none"
              borderRadius={radius.sm}
              color={color.text.muted}
              component="button"
              cursor="pointer"
              display="flex"
              justifyContent="center"
              padding={spacing.sm}
              transition={transition.fast}
              hoverBackgroundColor={color.bg.hover}
              {...focusRing('neutral')}
              props={{
                type: 'button',
                'aria-label': 'Start new session',
                onClick: handleReset,
              }}
            >
              <Tooltip>Start new session</Tooltip>
              <RotateCcwIcon size={14} />
            </Block>
            <CopyForCodingAgentButton recordingMeta={recordingMeta} />
          </Row>
        )}
        <MessageList
          entries={entries}
          loading={loading}
          error={error}
          onRetry={handleRetry}
          scrollContainerRef={scrollContainerRef}
          contentContainerRef={contentContainerRef}
          wasCancelled={wasCancelled}
          onFeedback={onFeedback}
          onGoToTime={onGoToTime}
          onSelectPrompt={prompt => {
            lastPromptRef.current = prompt
            agentic.query(prompt)
          }}
        >
          {stage === 'conclusion' && hypotheses.length > 0 && (
            <HypothesisList hypotheses={hypotheses} />
          )}
        </MessageList>
      </Col>

      <AgenticInputSection
        disabled={isActive}
        entries={entries}
        shouldRaise={shouldRaiseInput}
        hasConversationStarted={entries.length > 0}
        onFocusChange={setInputHasFocus}
        onSubmit={handleSubmit}
      />

      <LoadingIndicator
        loading={loading}
        onCancel={isActive ? agentic.cancel : undefined}
      />

      <JumpToEndButton
        shouldShow={shouldShowJumpToEndAction}
        loading={loading}
        onJumpToEnd={handleJumpToEnd}
      />
    </Block>
  )
}
