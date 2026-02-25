import { Block, Row } from '@jsxstyle/react'
import { CheckCircle, Circle } from 'lucide-react'
import React, { useCallback, useRef } from 'react'
import { focusRing } from '../tokens/interaction'
import { colors } from '../theme'

interface Props {
  options: Array<{
    value: number
    label: string
  }>
  selected: number
  onChange(selected: number): void
}

export const ToggleGroup: React.FC<Props> = ({
  options,
  selected,
  onChange,
}) => {
  const groupRef = useRef<HTMLDivElement>(null)

  const handleKeyDown = useCallback(
    (evt: React.KeyboardEvent<HTMLDivElement>) => {
      const currentIndex = options.findIndex(o => o.value === selected)
      let nextIndex: number | null = null

      if (evt.key === 'ArrowRight' || evt.key === 'ArrowDown') {
        evt.preventDefault()
        nextIndex = (currentIndex + 1) % options.length
      } else if (evt.key === 'ArrowLeft' || evt.key === 'ArrowUp') {
        evt.preventDefault()
        nextIndex = (currentIndex - 1 + options.length) % options.length
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
          const buttons = groupRef.current?.querySelectorAll<HTMLElement>(
            '[role="radio"]'
          )
          buttons?.[nextIndex]?.focus()
        }
      }
    },
    [options, selected, onChange]
  )

  return (
    <Row
      gap={10}
      props={{
        ref: groupRef,
        role: 'radiogroup',
        onKeyDown: handleKeyDown,
      }}
    >
      {options.map(({ value, label }) => (
        <Toggle
          key={value}
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
    gap={10}
    paddingH={10}
    paddingV={5}
    fontSize={11}
    backgroundColor={active ? colors.slate['500'] : colors.slate['100']}
    backgroundImage={
      active
        ? `linear-gradient(to top right, ${colors.slate['700']}, ${colors.slate['600']})`
        : undefined
    }
    borderColor={active ? colors.slate['800'] : 'transparent'}
    borderWidth={1}
    borderStyle="solid"
    borderRadius="99rem"
    boxShadow={active ? '0 2px 4px rgba(0, 0, 0, 0.25)' : undefined}
    hoverBackgroundColor={active ? colors.slate['500'] : colors.slate['200']}
    transition="all linear 100ms"
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
    <Block color={active ? colors.white : colors.blue['700']}>
      {active ? <CheckCircle size={14} /> : <Circle size={14} />}
    </Block>

    <Block fontSize={11} color={active ? colors.white : colors.slate['800']}>
      {label}
    </Block>
  </Row>
)
