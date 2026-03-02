import { Block } from '@jsxstyle/react'
import React, {
  MutableRefObject,
  forwardRef,
  useEffect,
  useRef,
  useState,
} from 'react'
import { UseFormRegisterReturn } from 'react-hook-form'
import mergeRefs from 'react-merge-refs'
import { focusWithinRing } from '../tokens/interaction'
import { color } from '../tokens/colors'
import { radius } from '../tokens/elevation'
import { transition } from '../tokens/motion'
import { spacing } from '../tokens/spacing'
import { MINIMUM_FONT_SIZE } from '../tokens/typography'

type Context = 'normal' | 'error'
type Size = 'small' | 'medium' | 'large' | 'xlarge'

interface Props extends Omit<UseFormRegisterReturn, 'ref'> {
  autoComplete?: string
  autoFocus?: boolean
  context?: Context
  disabled?: boolean
  label?: string
  placeholder?: string
  rows?: number
  size?: Size
  type?: string
}

const sizes = {
  small: 6,
  medium: 10,
  large: 12,
  xlarge: 16,
}

/**
 * Form text input with floating label animation and error styling.
 *
 * Renders a single-line `<input>` by default, or a `<textarea>` when
 * `rows` is greater than 1. Integrates with react-hook-form via
 * `UseFormRegisterReturn` props. Stops keyboard event propagation to
 * prevent conflicts with global shortcuts.
 */
export const Input = forwardRef<HTMLInputElement | HTMLTextAreaElement, Props>(
  (
    {
      autoFocus = false,
      context = 'normal',
      disabled = false,
      label = '',
      placeholder = '',
      rows = 1,
      size = 'medium',
      type = 'text',
      name,
      onBlur,
      onChange,
      ...restProps
    },
    outerRef
  ) => {
    const innerRef = useRef() as MutableRefObject<
      HTMLInputElement | HTMLTextAreaElement
    >
    const ref = mergeRefs([innerRef, outerRef])

    const [value, setValue] = useState('')
    const [focused, setFocused] = useState(false)
    const labelFloated = !label || focused || value !== ''
    const fontSize = Math.max(sizes[size] * 1.5, MINIMUM_FONT_SIZE)

    function preventKeyCapture(evt: React.KeyboardEvent<HTMLElement>) {
      evt.stopPropagation()
    }

    function handleFocus() {
      setFocused(true)
    }

    function handleBlur(evt: React.FocusEvent) {
      onBlur(evt)
      setFocused(false)
    }

    function handleChange(
      evt: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
    ) {
      onChange(evt)
      setValue(evt.target.value)
    }

    useEffect(() => {
      if (innerRef.current) {
        setValue(innerRef.current.value)
      }
    }, [innerRef, setValue])

    return (
      <Block
        component="label"
        backgroundColor={color.bg.surface}
        borderColor={
          context === 'error'
            ? color.danger
            : focused
            ? color.border.focus
            : color.border.strong
        }
        borderRadius={radius.sm}
        borderStyle="solid"
        borderWidth={1}
        boxShadow={`0 0.5px 1.5px ${color.border.strong}DA`}
        position="relative"
        {...focusWithinRing(context === 'error' ? 'danger' : 'default')}
      >
        {label && (
          <Block
            padding={spacing.sm}
            position="absolute"
            top={value !== '' || focused ? 0 : rows > 1 ? sizes[size] : '50%'}
            left={spacing.md}
            translate={value !== '' || focused || rows > 1 ? undefined : '0 -50%'}
            fontSize={fontSize}
            lineHeight={1}
            backgroundColor={color.bg.surface}
            color={
              context === 'error'
                ? color.danger
                : focused
                ? color.primary
                : color.text.muted
            }
            pointerEvents="none"
            scale={value !== '' || focused ? 0.8 : 1}
            transformOrigin="0 0"
            transition={transition.fast}
          >
            {label}
          </Block>
        )}

        <Block
          component={rows > 1 ? 'textarea' : 'input'}
          padding={sizes[size]}
          width="100%"
          fontFamily="inherit"
          fontSize={fontSize}
          lineHeight={1.5}
          color={color.text.default}
          placeholderColor={color.text.muted}
          backgroundColor="transparent"
          borderColor="transparent"
          borderRadius={radius.sm}
          outline="none"
          resize="none"
          isolation="isolate"
          props={{
            name,
            autoFocus,
            disabled,
            placeholder: labelFloated ? placeholder : undefined,
            rows: rows > 1 ? rows : undefined,
            type,
            onKeyDown: preventKeyCapture,
            onKeyUp: preventKeyCapture,
            onKeyPress: preventKeyCapture,
            onFocus: handleFocus,
            onBlur: handleBlur,
            onChange: handleChange,
            ref: ref as any,
            ...restProps,
          }}
        />
      </Block>
    )
  }
)
