import { Block, Row } from '@jsxstyle/react'
import { color, fontSize, shadow, spacing, transition } from '@repro/design'
import { LogLevel } from '@repro/domain'
import { CheckCircle, Circle } from 'lucide-react'
import React from 'react'
import { enumToBitField } from './util'

interface Props {
  value: number
  onChange(value: number): void
}

export const LevelFilter: React.FC<Props> = ({ value, onChange }) => {
  function toggleLevel(level: LogLevel) {
    const bits = enumToBitField(level)
    onChange(value ^ bits)
  }

  return (
    <Row alignItems="center" gap={spacing.md}>
      <Toggle
        active={!!(value & enumToBitField(LogLevel.Error))}
        onClick={() => toggleLevel(LogLevel.Error)}
      >
        Error
      </Toggle>

      <Toggle
        active={!!(value & enumToBitField(LogLevel.Warning))}
        onClick={() => toggleLevel(LogLevel.Warning)}
      >
        Warning
      </Toggle>

      <Toggle
        active={!!(value & enumToBitField(LogLevel.Info))}
        onClick={() => toggleLevel(LogLevel.Info)}
      >
        Info
      </Toggle>

      <Toggle
        active={!!(value & enumToBitField(LogLevel.Verbose))}
        onClick={() => toggleLevel(LogLevel.Verbose)}
      >
        Verbose
      </Toggle>
    </Row>
  )
}

interface ToggleProps {
  active: boolean
  onClick(): void
}

const Toggle: React.FC<React.PropsWithChildren<ToggleProps>> = ({
  active,
  children,
  onClick,
}) => {
  return (
    <Row
      alignItems="center"
      gap={spacing.lg}
      paddingV={spacing.sm}
      paddingH={spacing.lg}
      fontSize={fontSize.xs}
      backgroundColor={active ? color.text.muted : color.bg.hover}
      backgroundImage={
        active
          ? `linear-gradient(to top right, ${color.neutralHover}, ${color.text.muted})`
          : undefined
      }
      borderColor={active ? color.neutral : 'transparent'}
      borderWidth={1}
      borderStyle="solid"
      borderRadius="99rem"
      boxShadow={active ? shadow.sm : undefined}
      hoverBackgroundColor={active ? color.text.muted : color.border.default}
      transition={transition.fast}
      cursor="pointer"
      userSelect="none"
      props={{ onClick }}
    >
      <Block color={active ? color.text.inverse : color.primary}>
        {active ? <CheckCircle size={14} /> : <Circle size={14} />}
      </Block>

      <Block color={active ? color.text.inverse : color.text.default}>
        {children}
      </Block>
    </Row>
  )
}
