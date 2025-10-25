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
import { colors } from '../theme'

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
  small: 8,
  medium: 10,
  large: 12,
  xlarge: 16,
}

const MINIMUM_FONT_SIZE = 12

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
        backgroundColor={colors.white}
        borderColor={
          context === 'error'
            ? colors.rose['500']
            : focused
            ? colors.blue['500']
            : colors.slate['300']
        }
        borderRadius={4}
        borderStyle="solid"
        borderWidth={1}
        boxShadow={`0 0.5px 1.5px ${colors.slate['300']}DA`}
        outline={
          focused
            ? `4px solid ${
                context === 'error' ? colors.rose['100'] : colors.blue['100']
              }`
            : 'none'
        }
        position="relative"
      >
        {label && (
          <Block
            padding={4}
            position="absolute"
            top={value !== '' || focused ? 0 : '50%'}
            left={6}
            translate="0 -50%"
            fontSize={fontSize}
            lineHeight={1}
            backgroundColor={colors.white}
            color={
              context === 'error'
                ? colors.rose['500']
                : focused
                ? colors.blue['500']
                : colors.slate['500']
            }
            pointerEvents="none"
            scale={value !== '' || focused ? 0.8 : 1}
            transformOrigin="0 0"
            transition="all 100ms linear"
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
          color={colors.slate['800']}
          placeholderColor={colors.slate['500']}
          backgroundColor="transparent"
          borderColor="transparent"
          borderRadius={4}
          outline="none"
          resize="none"
          isolation="isolate"
          props={{
            name,
            autoFocus,
            disabled,
            placeholder,
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
