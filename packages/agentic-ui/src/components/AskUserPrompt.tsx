import { Block, Col, Row } from '@jsxstyle/react'
import type { AskUserRequest, AskUserResult } from '@repro/agentic'
import { Button, color, radius, spacing, textStyles } from '@repro/design'
import React, { useCallback, useState } from 'react'

interface AskUserPromptProps {
  request: AskUserRequest
  toolCallId: string
  onSubmit: (result: AskUserResult) => void
  disabled?: boolean
}

export const AskUserPrompt: React.FC<AskUserPromptProps> = ({
  request,
  toolCallId,
  onSubmit,
  disabled = false,
}) => {
  const { prompt, choices, multiple, allowFreeform } = request
  const [selectedValues, setSelectedValues] = useState<Set<string>>(new Set())
  const [freeformValue, setFreeformValue] = useState('')
  const [submitted, setSubmitted] = useState(false)

  const isPromptOnly = !choices && !allowFreeform
  const hasChoices = !!choices && choices.length > 0
  const isMultiSelect = multiple === true
  const isFreeformOnly = !choices && !!allowFreeform

  const handleToggleChoice = useCallback(
    (value: string) => {
      if (disabled || submitted) return
      if (isMultiSelect) {
        setSelectedValues(prev => {
          const next = new Set(prev)
          if (next.has(value)) {
            next.delete(value)
          } else {
            next.add(value)
          }
          return next
        })
      } else {
        setSelectedValues(new Set([value]))
      }
    },
    [disabled, submitted, isMultiSelect]
  )

  const handleSubmit = useCallback(() => {
    if (disabled || submitted) return
    setSubmitted(true)

    const answer = isMultiSelect
      ? Array.from(selectedValues)
      : Array.from(selectedValues)[0] ?? ''

    const result: AskUserResult = {
      answer,
      ...(allowFreeform && freeformValue.trim()
        ? { freeformAnswer: freeformValue.trim() }
        : {}),
    }

    onSubmit(result)
  }, [
    disabled,
    submitted,
    selectedValues,
    freeformValue,
    isMultiSelect,
    allowFreeform,
    onSubmit,
  ])

  const handleAcknowledge = useCallback(() => {
    if (disabled || submitted) return
    setSubmitted(true)
    onSubmit({ answer: 'acknowledged' })
  }, [disabled, submitted, onSubmit])

  const isSubmitDisabled =
    disabled || submitted || (hasChoices && selectedValues.size === 0)

  return (
    <Col
      backgroundColor={color.bg.surface}
      borderColor={color.border.default}
      borderStyle="solid"
      borderWidth={1}
      borderRadius={radius.md}
      padding={spacing.lg}
      gap={spacing.md}
    >
      <Block {...textStyles.body}>{prompt}</Block>

      {hasChoices &&
        choices!.map(choice => {
          const isSelected = selectedValues.has(choice.value)

          return (
            <Row
              key={choice.value}
              alignItems="flex-start"
              gap={spacing.sm}
              cursor={disabled ? 'default' : 'pointer'}
              padding={spacing.sm}
              borderRadius={radius.sm}
              hoverBackgroundColor={disabled ? undefined : color.bg.hover}
              component="label"
            >
              <input
                type={isMultiSelect ? 'checkbox' : 'radio'}
                name={toolCallId}
                value={choice.value}
                checked={isSelected}
                onChange={() => handleToggleChoice(choice.value)}
                disabled={disabled || submitted}
              />
              <Col gap={spacing.xs}>
                <Block {...textStyles.body}>{choice.label}</Block>
                {choice.description && (
                  <Block {...textStyles.caption} color={color.text.secondary}>
                    {choice.description}
                  </Block>
                )}
              </Col>
            </Row>
          )
        })}

      {allowFreeform && (
        <Block
          component="textarea"
          width="100%"
          padding={spacing.sm}
          borderRadius={radius.sm}
          borderWidth={1}
          borderColor={color.border.default}
          borderStyle="solid"
          resize="vertical"
          props={{
            rows: 3,
            value: freeformValue,
            onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) =>
              setFreeformValue(e.target.value),
            disabled: disabled || submitted,
            placeholder: isFreeformOnly
              ? 'Type your answer…'
              : 'Additional details (optional)',
          }}
        />
      )}

      <Row justifyContent="flex-end">
        {isPromptOnly ? (
          <Button
            variant="contained"
            size="small"
            disabled={disabled || submitted}
            props={{ onClick: handleAcknowledge }}
          >
            Got it
          </Button>
        ) : (
          <Button
            variant="contained"
            size="small"
            disabled={isSubmitDisabled}
            props={{ onClick: handleSubmit }}
          >
            {submitted ? 'Submitted' : 'Submit'}
          </Button>
        )}
      </Row>
    </Col>
  )
}
