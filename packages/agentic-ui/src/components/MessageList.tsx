import { Block, Col } from '@jsxstyle/react'
import { Md } from '@m2d/react-markdown'
import { AgenticError, Entry, Loading, groupToolCalls } from '@repro/agentic'
import { color, fontSize, lineHeight, spacing } from '@repro/design'
import React, { useMemo } from 'react'
import {
  INPUT_CONTAINER_OFFSET_PX,
  LOADING_CONTAINER_OFFSET_PX,
} from '../constants'
import { EmptyState } from '../EmptyState'
import { ErrorMessage } from './ErrorMessage'
import { ResponseFeedback } from './ResponseFeedback'
import { ToolCallGroup } from './ToolCallGroup'
import { TruncationSeparator } from './TruncationSeparator'

interface MessageListProps {
  entries: Array<Entry>
  loading: Loading
  error: AgenticError | null
  onRetry: () => void
  scrollContainerRef: React.RefObject<HTMLDivElement>
  contentContainerRef: React.RefObject<HTMLDivElement>
  onSelectPrompt: (prompt: string) => void
  wasCancelled: boolean
  onFeedback?: (sentiment: 'positive' | 'negative') => void
  onGoToTime?: (timeMs: number) => void
  children?: React.ReactNode
}

export const MessageList: React.FC<MessageListProps> = ({
  entries,
  loading,
  error,
  onRetry,
  scrollContainerRef,
  contentContainerRef,
  onSelectPrompt,
  wasCancelled,
  onFeedback,
  onGoToTime,
  children,
}) => {
  const renderItems = useMemo(() => groupToolCalls(entries), [entries])

  // When loading is active the input is hidden and the loading indicator sits
  // absolutely positioned at the bottom of the container. Add extra bottom
  // padding so the last message is never obscured by the indicator.
  const isLoading = loading !== 'none' && loading !== 'cancelled'

  return (
    <Block
      blockSize={
        loading === 'none'
          ? `calc(100cqb - ${INPUT_CONTAINER_OFFSET_PX}px)`
          : '100cqb'
      }
      fontSize={fontSize.sm}
      overflowY="scroll"
      paddingBlockStart={spacing.lg}
      paddingBlockEnd={isLoading ? LOADING_CONTAINER_OFFSET_PX : spacing.lg}
      paddingInline={spacing['2xl']}
      transition="block-size 250ms ease-in-out"
      props={{ ref: scrollContainerRef }}
    >
      <Col
        gap={spacing.lg}
        minBlockSize="100%"
        props={{ ref: contentContainerRef }}
      >
        {entries.length === 0 && <EmptyState onSelectPrompt={onSelectPrompt} />}

        {renderItems.map((item, index) => {
          if (item.type === 'truncation-indicator') {
            return <TruncationSeparator key={`truncation-${index}`} />
          }

          if (item.type === 'user-message') {
            return (
              <Col key={item.entry.id} lineHeight={lineHeight.relaxed}>
                <Block
                  marginInlineStart={spacing['3xl']}
                  paddingInline={spacing.lg}
                  backgroundColor={color.infoSubtle}
                  borderColor={color.infoBorder}
                  borderStyle="solid"
                  borderWidth={0}
                  borderBlockEndWidth={3}
                  borderRadius={8}
                >
                  <Md>{item.entry.content}</Md>
                </Block>
              </Col>
            )
          }

          if (item.type === 'assistant-message') {
            return (
              <Col key={item.entry.id} lineHeight={lineHeight.relaxed}>
                <Block>
                  <Md>{item.entry.content}</Md>
                </Block>
                {item.entry.content.length > 0 &&
                  loading === 'none' &&
                  onFeedback != null && (
                    <ResponseFeedback onFeedback={onFeedback} />
                  )}
              </Col>
            )
          }

          return (
            <ToolCallGroup
              key={`tool-group-${item.pairs[0]?.toolCall.id}`}
              pairs={item.pairs}
              isExecuting={loading === 'tool-executing'}
              wasCancelled={wasCancelled}
              onGoToTime={onGoToTime}
            />
          )
        })}

        {children}
        {error !== null && <ErrorMessage error={error} onRetry={onRetry} />}
      </Col>
    </Block>
  )
}
