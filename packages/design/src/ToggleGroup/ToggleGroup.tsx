import { Block, Row } from '@jsxstyle/react'
import { CheckCircle, Circle } from 'lucide-react'
import React, { useCallback, useRef } from 'react'
import { color } from '../tokens/colors'
import { radius, shadow } from '../tokens/elevation'
import { focusRing } from '../tokens/interaction'
import { transition } from '../tokens/motion'
import { spacing } from '../tokens/spacing'
import { fontSize, lineHeight } from '../tokens/typography'

type ToggleGroupValue = string | number

interface Option<T extends ToggleGroupValue> {
  value: T
  label: string
}

interface Props<T extends ToggleGroupValue> {
  options: ReadonlyArray<Option<T>>
  selected: T
  onChange(selected: T): void
}

/**
 * Radio group of pill-shaped toggle buttons with `role="radiogroup"`.
 *
 * Use for selecting one option from a small set of mutually exclusive
 * choices. Supports keyboard navigation (arrow keys, Home, End) with
 * roving tabindex. For a simple on/off toggle, use `Toggle` instead.
 */
export const ToggleGroup = <T extends ToggleGroupValue>({
  options,
  selected,
  onChange,
}: Props<T>) => {
  const groupRef = useRef<HTMLDivElement>(null)

  const handleKeyDown = useCallback(
    (evt: React.KeyboardEvent<HTMLDivElement>) => {
      if (options.length === 0) {
        return
      }

      const currentIndex = options.findIndex(o => o.value === selected)
      const safeCurrentIndex = currentIndex === -1 ? 0 : currentIndex
      let nextIndex: number | null = null

      if (evt.key === 'ArrowRight' || evt.key === 'ArrowDown') {
        evt.preventDefault()
        nextIndex = (safeCurrentIndex + 1) % options.length
      } else if (evt.key === 'ArrowLeft' || evt.key === 'ArrowUp') {
        evt.preventDefault()
        nextIndex = (safeCurrentIndex - 1 + options.length) % options.length
      } else if (evt.key === 'Home') {
        evt.preventDefault()
        nextIndex = 0
      } else if (evt.key === 'End') {
        evt.preventDefault()
        nextIndex = options.length - 1
      }

      if (nextIndex !== null) {
        const option = options[nextIndex]
        if (option) {
          onChange(option.value)
          // Move DOM focus to the newly selected radio button
          const buttons =
            groupRef.current?.querySelectorAll<HTMLElement>('[role="radio"]')
          buttons?.[nextIndex]?.focus()
        }
      }
    },
    [options, selected, onChange]
  )

  return (
    <Row
      gap={spacing.md}
      props={{
        ref: groupRef,
        role: 'radiogroup',
        onKeyDown: handleKeyDown,
      }}
    >
      {options.map(({ value, label }) => (
        <Toggle
          key={String(value)}
          active={selected === value}
          label={label}
          onClick={() => onChange(value)}
        />
      ))}
    </Row>
  )
}

interface ToggleProps {
  active: boolean
  label: string
  onClick(): void
}

const Toggle: React.FC<ToggleProps> = ({ active, label, onClick }) => (
  <Row
    component="button"
    alignItems="center"
    cursor="pointer"
    fontFamily="inherit"
    gap={spacing.md}
    paddingH={spacing.md}
    paddingV={spacing.sm}
    fontSize={fontSize.xs}
    backgroundColor={active ? color.bg.emphasis : color.bg.hover}
    backgroundImage={
      active
        ? `linear-gradient(to top right, ${color.neutral}, ${color.neutralHover})`
        : undefined
    }
    borderColor={active ? color.bg.emphasis : 'transparent'}
    borderWidth={1}
    borderStyle="solid"
    borderRadius={radius.full}
    boxShadow={active ? shadow.sm : undefined}
    hoverBackgroundColor={active ? color.bg.emphasis : color.border.default}
    transition={transition.fast}
    props={{
      type: 'button',
      role: 'radio',
      'aria-checked': active,
      // Roving tabindex: only the selected option is in the tab order
      tabIndex: active ? 0 : -1,
      onClick,
    }}
    {...focusRing()}
  >
    <Block lineHeight={0} color={active ? color.text.inverse : color.primary}>
      {active ? <CheckCircle size={14} /> : <Circle size={14} />}
    </Block>

    <Block
      fontSize={fontSize.xs}
      lineHeight={lineHeight.tight}
      color={active ? color.text.inverse : color.text.default}
    >
      {label}
    </Block>
  </Row>
)
