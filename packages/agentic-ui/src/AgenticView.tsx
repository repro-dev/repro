import { Block, Col, Row } from '@jsxstyle/react'
import {
  type AssistantMessage,
  type Audience,
  buildInvestigationSummary,
  parseDiagnosisFromAssistant,
  type RecordingMeta,
  sortHypothesesByConfidence,
} from '@repro/agentic'
import { useAtomValue } from '@repro/atom'
import {
  AgenticInputFormState,
  Button,
  color,
  shadow,
  spacing,
  Tooltip,
} from '@repro/design'
import { History, SquarePen } from 'lucide-react'
import React, { useEffect, useMemo, useRef, useState } from 'react'
import { AgenticInputSection } from './components/AgenticInputSection'
import { CopyForCodingAgentButton } from './components/CopyForCodingAgentButton'
import { DiagnosisBlock } from './components/DiagnosisBlock'
import { HypothesisList } from './components/HypothesisList'
import { JumpToEndButton } from './components/JumpToEndButton'
import { LoadingIndicator } from './components/LoadingIndicator'
import { MessageList } from './components/MessageList'
import { useAgenticState } from './context'
import { useHistoryScroll } from './hooks/useHistoryScroll'

export const AgenticView: React.FC<{
  audience?: Audience
  onFeedback?: (sentiment: 'positive' | 'negative') => void
  onGoToTime?: (timeMs: number) => void
  onInvestigationComplete?: (summary: string) => void
  recordingMeta?: RecordingMeta | null
  onAction?: (action: string) => void
}> = ({
  audience = 'extension',
  onFeedback,
  onGoToTime,
  onInvestigationComplete,
  recordingMeta = null,
  onAction,
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

  // Find the last assistant message to parse diagnosis data
  const isAssistantMessage = (
    e: (typeof entries)[number]
  ): e is AssistantMessage => e.role === 'assistant' && e.content.length > 0

  const lastAssistant = useMemo(() => {
    const reversed = [...entries].reverse()
    return reversed.find(isAssistantMessage)
  }, [entries])

  const diagnosisContent = useMemo(
    () =>
      lastAssistant ? parseDiagnosisFromAssistant(lastAssistant.content) : null,
    [lastAssistant]
  )

  // Sort hypotheses once and reuse for both topHypothesis and DiagnosisBlock
  const sortedHypotheses = useMemo(
    () => sortHypothesesByConfidence(hypotheses),
    [hypotheses]
  )

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
            gap={spacing.sm}
            alignItems="center"
            padding={spacing.sm}
            background={color.bg.surface}
            boxShadow={shadow.sm}
          >
            <Button
              variant="text"
              size="small"
              aria-label="Start new session"
              props={{ onClick: handleReset }}
            >
              <SquarePen size={14} />
              <Tooltip>Start new session</Tooltip>
            </Button>
            <Button
              variant="text"
              size="small"
              disabled
              aria-label="View history"
            >
              <History size={14} />
              <Tooltip>Previous sessions</Tooltip>
            </Button>
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
          {stage === 'conclusion' && diagnosisContent !== null && (
            <DiagnosisBlock
              diagnosisContent={diagnosisContent}
              topHypothesis={sortedHypotheses[0] ?? null}
              allHypotheses={sortedHypotheses}
              audience={audience}
              onAction={onAction ?? (() => {})}
            />
          )}
          {stage === 'conclusion' &&
            diagnosisContent === null &&
            hypotheses.length > 0 && (
              <HypothesisList hypotheses={sortedHypotheses} />
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
