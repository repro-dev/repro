import { Col } from '@jsxstyle/react'
import React, {
  forwardRef,
  useCallback,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react'
import mergeRefs from 'react-merge-refs'
import { color } from '../tokens/colors'
import { radius } from '../tokens/elevation'
import { AccordionProvider, AccordionValue } from './AccordionContext'

export interface AccordionProps {
  mode?: 'single' | 'multiple'
  value?: AccordionValue
  defaultValue?: AccordionValue
  onValueChange?: (value: AccordionValue) => void
  children: React.ReactNode
}

function valueToArray(value: AccordionValue): string[] {
  if (Array.isArray(value)) return value
  if (typeof value === 'string') return [value]
  return []
}

/** Compound disclosure list with single or multiple expanded items. */
export const Accordion = forwardRef<HTMLDivElement, AccordionProps>(
  (
    {
      mode = 'single',
      value,
      defaultValue = mode === 'multiple' ? [] : null,
      onValueChange,
      children,
    },
    ref
  ) => {
    const baseId = useId()
    const rootRef = useRef<HTMLDivElement>(null)
    const [internalValue, setInternalValue] =
      useState<AccordionValue>(defaultValue)
    const [activeValue, setActiveValue] = useState<string | null>(null)
    const isControlled = value !== undefined
    const currentValue = isControlled ? value : internalValue

    const setNextValue = useCallback(
      (nextValue: AccordionValue) => {
        if (!isControlled) {
          setInternalValue(nextValue)
        }
        onValueChange?.(nextValue)
      },
      [isControlled, onValueChange]
    )

    const isItemOpen = useCallback(
      (itemValue: string) => valueToArray(currentValue).includes(itemValue),
      [currentValue]
    )

    const toggleItem = useCallback(
      (itemValue: string) => {
        if (mode === 'multiple') {
          const values = valueToArray(currentValue)
          setNextValue(
            values.includes(itemValue)
              ? values.filter(value => value !== itemValue)
              : [...values, itemValue]
          )
          return
        }

        setNextValue(currentValue === itemValue ? null : itemValue)
      },
      [currentValue, mode, setNextValue]
    )

    const getEnabledTriggers = useCallback(() => {
      if (!rootRef.current) return []
      return Array.from(
        rootRef.current.querySelectorAll<HTMLButtonElement>(
          '[data-repro-accordion-trigger]:not(:disabled)'
        )
      )
    }, [])

    const handleKeyDown = useCallback(
      (event: React.KeyboardEvent<HTMLDivElement>) => {
        const enabledTriggers = getEnabledTriggers()
        if (enabledTriggers.length === 0) return

        const activeElement = document.activeElement
        const eventTarget = event.target
        const currentIndex = enabledTriggers.findIndex(trigger => {
          if (trigger === activeElement || trigger === eventTarget) return true
          return eventTarget instanceof Node && trigger.contains(eventTarget)
        })
        if (currentIndex === -1) return

        let nextIndex: number | null = null

        if (event.key === 'ArrowDown') {
          event.preventDefault()
          nextIndex = (currentIndex + 1) % enabledTriggers.length
        } else if (event.key === 'ArrowUp') {
          event.preventDefault()
          nextIndex =
            (currentIndex - 1 + enabledTriggers.length) % enabledTriggers.length
        } else if (event.key === 'Home') {
          event.preventDefault()
          nextIndex = 0
        } else if (event.key === 'End') {
          event.preventDefault()
          nextIndex = enabledTriggers.length - 1
        }

        if (nextIndex !== null) {
          const nextTrigger = enabledTriggers[nextIndex]
          const nextValue = nextTrigger?.dataset.reproAccordionValue
          if (nextTrigger && nextValue) {
            setActiveValue(nextValue)
            nextTrigger.focus()
          }
        }
      },
      [getEnabledTriggers]
    )

    const context = useMemo(
      () => ({
        mode,
        baseId,
        activeValue,
        setActiveValue,
        isItemOpen,
        toggleItem,
      }),
      [activeValue, baseId, isItemOpen, mode, toggleItem]
    )

    return (
      <AccordionProvider value={context}>
        <Col
          border={`1px solid ${color.border.default}`}
          borderRadius={radius.md}
          backgroundColor={color.bg.surface}
          overflow="hidden"
          props={{ ref: mergeRefs([ref, rootRef]), onKeyDown: handleKeyDown }}
        >
          {children}
        </Col>
      </AccordionProvider>
    )
  }
)

Accordion.displayName = 'Accordion'
