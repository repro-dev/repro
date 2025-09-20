import { Block, Row } from '@jsxstyle/react'
import { colors } from '@repro/design'
import { LogLevel } from '@repro/domain'
import { CheckCircle, Circle } from 'lucide-react'
import React, { PropsWithChildren } from 'react'
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
    <Row alignItems="center" gap={10}>
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

const Toggle: React.FC<PropsWithChildren<ToggleProps>> = ({
  active,
  children,
  onClick,
}) => {
  return (
    <Row
      alignItems="center"
      gap={10}
      paddingV={6}
      paddingH={12}
      fontSize={13}
      backgroundColor={active ? colors.slate['500'] : colors.slate['100']}
      backgroundImage={
        active
          ? `linear-gradient(to top right, ${colors.slate['600']}, ${colors.slate['500']})`
          : undefined
      }
      borderColor={active ? colors.slate['700'] : 'transparent'}
      borderWidth={1}
      borderStyle="solid"
      borderRadius="99rem"
      boxShadow={active ? '0 2px 4px rgba(0, 0, 0, 0.25)' : undefined}
      hoverBackgroundColor={active ? colors.slate['500'] : colors.slate['200']}
      transition="all linear 100ms"
      cursor="pointer"
      userSelect="none"
      props={{ onClick }}
    >
      <Block color={active ? colors.white : colors.blue['700']}>
        {active ? <CheckCircle size={16} /> : <Circle size={16} />}
      </Block>

      <Block color={active ? colors.white : colors.slate['800']}>
        {children}
      </Block>
    </Row>
  )
}
