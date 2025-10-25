import { Block, Row } from '@jsxstyle/react'
import { CheckCircle, Circle } from 'lucide-react'
import React from 'react'
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
}) => (
  <Row gap={10}>
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

interface ToggleProps {
  active: boolean
  label: string
  onClick(): void
}

const Toggle: React.FC<ToggleProps> = ({ active, label, onClick }) => (
  <Row
    alignItems="center"
    cursor="pointer"
    gap={10}
    paddingH={10}
    paddingV={5}
    fontSize={13}
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
    props={{ onClick }}
  >
    <Block color={active ? colors.white : colors.blue['700']}>
      {active ? <CheckCircle size={16} /> : <Circle size={16} />}
    </Block>

    <Block fontSize={13} color={active ? colors.white : colors.slate['800']}>
      {label}
    </Block>
  </Row>
)
