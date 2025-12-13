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
import colors from 'tailwindcss/colors'

export interface AgenticInputFormState {
  value: string
}

export interface AgenticInputProps {
  autoFocus?: boolean
  placeholders?: Array<string>
  onFocusChange(hasFocus: boolean): void
  onSubmit(formState: AgenticInputFormState): void
}

const PLACEHOLDER_ROTATION_INTERVAL = 3000

export const AgenticInput: React.FC<AgenticInputProps> = ({
  autoFocus,
  onFocusChange,
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
    config: { duration: 500 },
    trail: 500,
  })

  useEffect(() => {
    const handle = setInterval(() => {
      setPlaceholderIndex(index => (index + 1) % placeholders.length)
    }, PLACEHOLDER_ROTATION_INTERVAL)

    return () => {
      clearInterval(handle)
    }
  }, [placeholders.length])

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
    if (event.code === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      submitAndReset()
    }
  }

  function triggerFocus() {
    valueRef.current?.focus()
  }

  return (
    <form onSubmit={handleSubmit}>
      <Block
        cursor="text"
        fontSize={13}
        lineHeight={1.25}
        padding={8}
        position="relative"
        onClick={triggerFocus}
      >
        <Block
          backgroundColor="transparent"
          border="none"
          color={colors.slate['900']}
          component="textarea"
          fontFamily="inherit"
          fontSize="inherit"
          outline="none"
          padding={0}
          resize="none"
          value={value}
          width="100%"
          onChange={handleChange}
          onFocus={handleFocus}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          props={{ autoFocus, ref: valueRef }}
        />

        <Row justifyContent="flex-end">
          <Block
            alignItems="center"
            backgroundColor={
              hasValue ? colors.rose['500'] : colors.slate['200']
            }
            blockSize={32}
            border="none"
            borderRadius={4}
            color={colors.white}
            component="button"
            display="flex"
            inlineSize={32}
            justifyContent="center"
            lineHeight={1}
            transition="all linear 100ms"
            cursor={hasValue ? 'pointer' : 'default'}
            props={{ type: 'submit', disabled: !hasValue }}
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
                color: colors.slate['500'],
                display: 'flex',
                gap: 4,
                left: 8,
                pointerEvents: 'none',
                position: 'absolute',
                top: 8,
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
