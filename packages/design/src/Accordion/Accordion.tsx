import { Block } from '@jsxstyle/react'
import React, {
  PropsWithChildren,
  forwardRef,
  useCallback,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react'
import mergeRefs from 'react-merge-refs'
import { AccordionProvider } from './AccordionContext'

export interface AccordionProps {
  multiple?: boolean
  defaultValue?: string | string[]
  value?: string | string[]
  disabled?: boolean
  orientation?: 'vertical' | 'horizontal'
  onValueChange?: (value: string | string[]) => void
  children: React.ReactNode
}

function normalizeValues(
  value: string | string[] | undefined,
  multiple: boolean
) {
  if (multiple) {
    if (Array.isArray(value)) {
      return value
    }
    return value ? [value] : []
  }

  if (Array.isArray(value)) {
    return value.length > 0 ? [value[0]!] : []
  }

  return value ? [value] : []
}

/**
 * Compound accordion root. Use with `Accordion.Item`, `Accordion.Trigger`, and
 * `Accordion.Content` to build single- or multi-expand disclosure groups.
 *
 * Supports controlled and uncontrolled open state. Keyboard navigation is
 * handled on the item triggers only.
 */
export const Accordion = forwardRef<
  HTMLDivElement,
  PropsWithChildren<AccordionProps>
>(
  (
    {
      multiple = false,
      defaultValue,
      value,
      disabled = false,
      orientation = 'vertical',
      onValueChange,
      children,
    },
    ref
  ) => {
    const isControlled = value !== undefined
    const [internalValue, setInternalValue] = useState<string[]>(
      normalizeValues(defaultValue, multiple)
    )
    const openValues = normalizeValues(
      isControlled ? value : internalValue,
      multiple
    )
    const baseId = useId()
    const containerRef = useRef<HTMLDivElement>(null)

    const toggleValue = useCallback(
      (nextValue: string) => {
        if (disabled) return

        let nextOpenValues: string[]
        if (multiple) {
          nextOpenValues = openValues.includes(nextValue)
            ? openValues.filter(value => value !== nextValue)
            : [...openValues, nextValue]
        } else {
          nextOpenValues = openValues[0] === nextValue ? [] : [nextValue]
        }

        if (!isControlled) {
          setInternalValue(nextOpenValues)
        }

        onValueChange?.(multiple ? nextOpenValues : nextOpenValues[0] ?? '')
      },
      [disabled, isControlled, multiple, onValueChange, openValues]
    )

    const isOpen = useCallback(
      (nextValue: string) => openValues.includes(nextValue),
      [openValues]
    )

    const handleTriggerKeyDown = useCallback(
      (evt: React.KeyboardEvent<HTMLButtonElement>) => {
        const container = containerRef.current
        if (!container) return

        const triggers = Array.from(
          container.querySelectorAll<HTMLButtonElement>(
            `button[aria-controls^="${baseId}-content-"]:not(:disabled)`
          )
        )
        if (triggers.length === 0) return

        const focusedEl = document.activeElement as HTMLElement
        const currentIndex = triggers.indexOf(focusedEl as HTMLButtonElement)
        const safeIndex = currentIndex === -1 ? 0 : currentIndex

        let nextIndex: number | null = null
        const isForward =
          orientation === 'horizontal'
            ? evt.key === 'ArrowRight'
            : evt.key === 'ArrowDown'
        const isBack =
          orientation === 'horizontal'
            ? evt.key === 'ArrowLeft'
            : evt.key === 'ArrowUp'

        if (isForward) {
          evt.preventDefault()
          nextIndex = (safeIndex + 1) % triggers.length
        } else if (isBack) {
          evt.preventDefault()
          nextIndex = (safeIndex - 1 + triggers.length) % triggers.length
        } else if (evt.key === 'Home') {
          evt.preventDefault()
          nextIndex = 0
        } else if (evt.key === 'End') {
          evt.preventDefault()
          nextIndex = triggers.length - 1
        }

        if (nextIndex !== null) {
          triggers[nextIndex]?.focus()
        }
      },
      [orientation]
    )

    const ctx = useMemo(
      () => ({
        openValues,
        multiple,
        disabled,
        orientation,
        baseId,
        toggleValue,
        isOpen,
        handleTriggerKeyDown,
      }),
      [
        baseId,
        disabled,
        handleTriggerKeyDown,
        isOpen,
        multiple,
        openValues,
        orientation,
        toggleValue,
      ]
    )

    return (
      <AccordionProvider value={ctx}>
        <Block props={{ ref: mergeRefs([ref, containerRef]) }}>
          {children}
        </Block>
      </AccordionProvider>
    )
  }
)

Accordion.displayName = 'Accordion'
