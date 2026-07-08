import { Block, Col, Row } from '@jsxstyle/react'
import type { AskUserRequest, AskUserResult } from '@repro/agentic'
import {
  Button,
  Checkbox,
  Radio,
  RadioGroup,
  TextField,
  color,
  radius,
  spacing,
  textStyles,
} from '@repro/design'
import React, { useCallback, useState } from 'react'

interface AskUserPromptProps {
  request: AskUserRequest
  toolCallId: string
  onSubmit: (result: AskUserResult) => void
  disabled?: boolean
  fullBleed?: boolean
}

export const AskUserPrompt: React.FC<AskUserPromptProps> = ({
  request,
  toolCallId,
  onSubmit,
  disabled = false,
  fullBleed = false,
}) => {
  const { prompt, choices, multiple, allowFreeform } = request
  const [selectedValues, setSelectedValues] = useState<Set<string>>(new Set())
  const [freeformValue, setFreeformValue] = useState('')
  const [submitted, setSubmitted] = useState(false)

  const isPromptOnly = !choices && !allowFreeform
  const hasChoices = !!choices && choices.length > 0
  const isMultiSelect = multiple === true
  const isFreeformOnly = !choices && !!allowFreeform
  const selectedValue = Array.from(selectedValues)[0] ?? ''

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
      backgroundColor={fullBleed ? undefined : color.bg.surface}
      borderColor={fullBleed ? undefined : color.border.default}
      borderStyle={fullBleed ? undefined : 'solid'}
      borderWidth={fullBleed ? 0 : 1}
      borderRadius={fullBleed ? 0 : radius.md}
      padding={fullBleed ? 0 : spacing.lg}
      gap={fullBleed ? spacing['2xl'] : spacing.md}
    >
      <Block {...textStyles.bodySmall}>{prompt}</Block>

      {hasChoices && !isMultiSelect && (
        <RadioGroup
          label="Select an option"
          value={selectedValue}
          onChange={(value: string) => setSelectedValues(new Set([value]))}
          disabled={disabled || submitted}
        >
          {choices!.map(choice => (
            <Radio
              key={choice.value}
              value={choice.value}
              label={choice.label}
              description={choice.description}
            />
          ))}
        </RadioGroup>
      )}

      {hasChoices && isMultiSelect && (
        <Col gap={spacing.lg}>
          {choices!.map(choice => (
            <Checkbox
              key={choice.value}
              label={choice.label}
              checked={selectedValues.has(choice.value)}
              onChange={(checked: boolean) => {
                if (disabled || submitted) return
                setSelectedValues(prev => {
                  const next = new Set(prev)
                  if (checked) {
                    next.add(choice.value)
                  } else {
                    next.delete(choice.value)
                  }
                  return next
                })
              }}
              description={choice.description}
              disabled={disabled || submitted}
            />
          ))}
        </Col>
      )}

      {allowFreeform && (
        <TextField
          label={isFreeformOnly ? 'Your answer' : 'Additional details'}
          value={freeformValue}
          onChange={e => setFreeformValue(e.currentTarget.value)}
          placeholder={
            isFreeformOnly
              ? 'Type your answer…'
              : 'Additional details (optional)'
          }
          rows={3}
          disabled={disabled || submitted}
          name={toolCallId}
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
