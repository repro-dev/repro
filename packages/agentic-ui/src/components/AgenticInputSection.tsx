import { Block } from '@jsxstyle/react'
import { Entry } from '@repro/agentic'
import {
  AgenticInput,
  AgenticInputFormState,
  color,
  shadow,
  spacing,
} from '@repro/design'
import React from 'react'
import { PLACEHOLDER_COPY, REPLY_PLACEHOLDER } from '../constants'
import { useInputHistory } from '../hooks/useInputHistory'

interface AgenticInputSectionProps {
  disabled: boolean
  entries: Array<Entry>
  shouldRaise: boolean
  hasConversationStarted: boolean
  onFocusChange: (hasFocus: boolean) => void
  onSubmit: (state: AgenticInputFormState) => void
}

export const AgenticInputSection: React.FC<AgenticInputSectionProps> = ({
  disabled,
  entries,
  shouldRaise,
  hasConversationStarted,
  onFocusChange,
  onSubmit,
}) => {
  const { historyValue, navigate, resetHistory } = useInputHistory(entries)

  const placeholders = hasConversationStarted
    ? [REPLY_PLACEHOLDER]
    : PLACEHOLDER_COPY

  function handleSubmit(state: AgenticInputFormState) {
    // Exit history mode when user submits
    resetHistory()
    onSubmit(state)
  }

  return (
    <Block
      backgroundColor={shouldRaise ? color.bg.surface : color.bg.hover}
      borderColor={shouldRaise ? color.border.default : 'transparent'}
      borderStyle="solid"
      borderWidth={0}
      borderBlockStartWidth={1}
      borderRadius={shouldRaise ? 0 : 8}
      bottom={0}
      boxShadow={shouldRaise ? shadow.invertedSm : 'none'}
      left={0}
      marginBlock={shouldRaise ? -spacing['2xl'] : 0}
      marginInline={shouldRaise ? -spacing['2xl'] : 0}
      overflow="hidden"
      paddingBlock={shouldRaise ? spacing['2xl'] : 0}
      paddingInline={shouldRaise ? spacing['2xl'] : 0}
      position="absolute"
      right={0}
      transform={
        disabled
          ? `translateY(calc(100% + ${spacing['2xl']}px))`
          : `translateY(-${spacing['2xl']}px)`
      }
      transition="margin ease-in-out 100ms, padding ease-in-out 100ms, transform ease-in-out 250ms"
    >
      <AgenticInput
        disabled={disabled}
        placeholders={placeholders}
        historyValue={historyValue}
        onFocusChange={onFocusChange}
        onNavigateHistory={navigate}
        onSubmit={handleSubmit}
      />
    </Block>
  )
}
