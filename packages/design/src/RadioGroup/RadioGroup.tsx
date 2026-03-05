import { Col } from '@jsxstyle/react'
import React, { forwardRef, useCallback, useId, useMemo, useRef } from 'react'
import mergeRefs from 'react-merge-refs'
import { spacing } from '../tokens/spacing'
import { color } from '../tokens/colors'
import { fontSize, lineHeight, fontWeight } from '../tokens/typography'
import { RadioGroupProvider, type RadioGroupContextValue } from './RadioGroupContext'

export interface RadioGroupProps {
  label: string
  value: string
  onChange(value: string): void
  disabled?: boolean
  size?: 'small' | 'medium' | 'large'
  children: React.ReactNode
}

/**
 * Container for a set of `Radio` options where only one can be selected.
 *
 * Renders a `<fieldset>` with `role="radiogroup"` and provides context to
 * child `Radio` components. Supports keyboard navigation (Arrow Up/Down,
 * Home/End) with roving tabindex.
 */
export const RadioGroup = forwardRef<HTMLFieldSetElement, RadioGroupProps>(
  ({ label, value, onChange, disabled = false, size = 'medium', children }, ref) => {
    const generatedName = useId()
    const fieldsetRef = useRef<HTMLFieldSetElement>(null)

    const ctx = useMemo<RadioGroupContextValue>(
      () => ({ name: generatedName, value, onChange, disabled, size }),
      [generatedName, value, onChange, disabled, size]
    )

    const getRadioInputs = useCallback(() => {
      if (!fieldsetRef.current) return []
      return Array.from(
        fieldsetRef.current.querySelectorAll<HTMLInputElement>('input[type="radio"]')
      )
    }, [])

    const getEnabledRadioInputs = useCallback(() => {
      return getRadioInputs().filter(input => !input.disabled)
    }, [getRadioInputs])

    const handleKeyDown = useCallback(
      (evt: React.KeyboardEvent<HTMLFieldSetElement>) => {
        const enabledInputs = getEnabledRadioInputs()
        if (enabledInputs.length === 0) return

        const currentIndex = enabledInputs.findIndex(input => input.value === value)
        const safeCurrentIndex = currentIndex === -1 ? 0 : currentIndex
        let nextIndex: number | null = null

        if (evt.key === 'ArrowDown' || evt.key === 'ArrowRight') {
          evt.preventDefault()
          nextIndex = (safeCurrentIndex + 1) % enabledInputs.length
        } else if (evt.key === 'ArrowUp' || evt.key === 'ArrowLeft') {
          evt.preventDefault()
          nextIndex = (safeCurrentIndex - 1 + enabledInputs.length) % enabledInputs.length
        } else if (evt.key === 'Home') {
          evt.preventDefault()
          nextIndex = 0
        } else if (evt.key === 'End') {
          evt.preventDefault()
          nextIndex = enabledInputs.length - 1
        }

        if (nextIndex !== null) {
          const input = enabledInputs[nextIndex]
          if (input) {
            onChange(input.value)
            input.focus()
          }
        }
      },
      [value, onChange, getEnabledRadioInputs]
    )

    return (
      <Col
        component="fieldset"
        gap={spacing.md}
        border="none"
        margin={0}
        padding={0}
        props={{
          ref: mergeRefs([ref, fieldsetRef]),
          role: 'radiogroup',
          'aria-label': label,
          disabled: disabled || undefined,
          onKeyDown: handleKeyDown,
        }}
      >
        <legend
          style={{
            fontSize: fontSize.sm,
            fontWeight: fontWeight.semibold,
            lineHeight: lineHeight.tight,
            color: disabled ? color.text.muted : color.text.default,
            padding: 0,
          }}
        >
          {label}
        </legend>

        <RadioGroupProvider value={ctx}>
          {children}
        </RadioGroupProvider>
      </Col>
    )
  }
)

RadioGroup.displayName = 'RadioGroup'
