/* eslint-disable @repro/oxlint-plugin-design/no-hardcoded-spacing */
import { Block, Row } from '@jsxstyle/react'
import { animated, useTransition } from '@react-spring/web'
import { ArrowUpIcon, SparklesIcon } from 'lucide-react'
import React, {
  RefObject,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'
import { color } from '../tokens/colors'
import { radius } from '../tokens/elevation'
import { focusRing } from '../tokens/interaction'
import { delay, transition } from '../tokens/motion'
import { spacing } from '../tokens/spacing'
import { fontSize, lineHeight } from '../tokens/typography'

export interface AgenticInputFormState {
  value: string
}

export interface AgenticInputProps {
  autoFocus?: boolean
  disabled?: boolean
  placeholders?: Array<string>
  /**
   * When non-null, overrides the internal input value (e.g. during history
   * navigation). Changing this to null resets the input to empty.
   */
  historyValue?: string | null
  /**
   * Called when the user presses ArrowUp (when cursor is at position 0) or
   * ArrowDown (when already in history mode). The parent can use this to
   * implement shell-style history navigation and update `historyValue` accordingly.
   *
   * `currentValue` is the current input value at the time of the keypress —
   * provided so the parent can save it as a draft to restore later.
   */
  onNavigateHistory?: (direction: 'up' | 'down', currentValue: string) => void
  onFocusChange(hasFocus: boolean): void
  onSubmit(formState: AgenticInputFormState): void
}

const PLACEHOLDER_ROTATION_INTERVAL = delay.rotate

/**
 * Chat-style textarea with a submit button and animated rotating placeholders.
 *
 * Use for free-form agentic prompts. Submits on Enter (Shift+Enter for newline)
 * and auto-resizes to fit content. The `placeholders` prop cycles through
 * suggestion strings on a timer when the input is empty.
 */
export const AgenticInput: React.FC<AgenticInputProps> = ({
  autoFocus,
  disabled,
  historyValue,
  onFocusChange,
  onNavigateHistory,
  onSubmit,
  placeholders = [],
}) => {
  const [value, setValue] = useState('')
  const hasValue = value !== ''
  const hasNonEmptyValue = value.trim() !== ''

  const valueRef = useRef() as RefObject<HTMLTextAreaElement>

  const [placeholderIndex, setPlaceholderIndex] = useState(0)
  const placeholderTransition = useTransition(placeholderIndex, {
    key: placeholderIndex,
    from: { opacity: 0 },
    enter: { opacity: 1 },
    leave: { opacity: 0 },
    config: { duration: delay.fade },
    trail: delay.fade,
  })

  useEffect(() => {
    const handle = setInterval(() => {
      setPlaceholderIndex(index => (index + 1) % placeholders.length)
    }, PLACEHOLDER_ROTATION_INTERVAL)

    return () => {
      clearInterval(handle)
    }
  }, [placeholders.length])

  // Sync internal value when the parent drives historyValue.
  // historyValue === null means "exit history mode" → restore empty input.
  useEffect(() => {
    if (historyValue !== undefined) {
      setValue(historyValue ?? '')
    }
  }, [historyValue])

  useLayoutEffect(() => {
    if (valueRef.current) {
      valueRef.current.style.blockSize = 'auto'
      valueRef.current.style.blockSize = valueRef.current.scrollHeight + 'px'
    }
  }, [valueRef, value])

  function submitAndReset() {
    if (hasNonEmptyValue) {
      onSubmit({ value })
      setValue('')
    }
  }

  function handleChange(event: React.ChangeEvent<HTMLTextAreaElement>) {
    setValue(event.target.value)
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    submitAndReset()
  }

  function handleFocus(event: React.FocusEvent) {
    event.stopPropagation()
    onFocusChange(true)
  }

  function handleBlur(event: React.FocusEvent) {
    event.stopPropagation()
    onFocusChange(false)
  }

  function handleKeyDown(event: React.KeyboardEvent) {
    event.stopPropagation()

    if (event.code === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      submitAndReset()
      return
    }

    // Shell-style history navigation:
    // - ArrowUp: intercept when cursor is at position 0 (enter/advance history mode)
    // - ArrowDown: only intercept when already in history mode (historyValue != null),
    //   so normal cursor movement is never blocked when not navigating history.
    if (onNavigateHistory) {
      const textarea = valueRef.current
      const selectionStart = textarea?.selectionStart ?? null

      if (event.key === 'ArrowUp' && (value === '' || selectionStart === 0)) {
        event.preventDefault()
        onNavigateHistory('up', value)
        return
      }

      if (event.key === 'ArrowDown' && historyValue !== null) {
        event.preventDefault()
        onNavigateHistory('down', value)
        return
      }
    }
  }

  function triggerFocus() {
    valueRef.current?.focus()
  }

  return (
    <form onSubmit={handleSubmit} style={{ margin: 0 }}>
      <Block
        cursor="text"
        fontSize={fontSize.sm}
        lineHeight={lineHeight.normal}
        padding={spacing.md}
        position="relative"
        onClick={triggerFocus}
      >
        <Block
          backgroundColor="transparent"
          border="none"
          color={color.text.default}
          component="textarea"
          disabled={disabled}
          fontFamily="inherit"
          fontSize="inherit"
          lineHeight={1.5}
          outline="none"
          padding={spacing.none}
          resize="none"
          value={value}
          width="100%"
          onChange={handleChange}
          onFocus={handleFocus}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          props={{ autoFocus, ref: valueRef }}
        />

        <Row justifyContent="flex-end" marginBlockStart={spacing.md}>
          <Block
            alignItems="center"
            backgroundColor={hasValue ? color.danger : color.bg.muted}
            blockSize={spacing['3xl']}
            border="none"
            borderRadius={radius.sm}
            color={color.text.inverse}
            component="button"
            display="flex"
            inlineSize={spacing['3xl']}
            justifyContent="center"
            lineHeight={lineHeight.tight}
            transition={transition.fast}
            cursor={hasValue ? 'pointer' : 'default'}
            props={{
              type: 'submit',
              'aria-label': 'Submit',
              disabled: disabled || !hasValue,
            }}
            {...focusRing()}
          >
            <ArrowUpIcon size={16} />
          </Block>
        </Row>

        {!hasValue &&
          placeholderTransition((style, index) => (
            <animated.div
              style={{
                ...style,
                alignItems: 'center',
                color: color.text.muted,
                display: 'flex',
                gap: spacing.sm,
                left: spacing.md,
                pointerEvents: 'none',
                position: 'absolute',
                top: spacing.md,
                userSelect: 'none',
              }}
            >
              <SparklesIcon size={13} />
              {placeholders[index]}
            </animated.div>
          ))}
      </Block>
    </form>
  )
}
