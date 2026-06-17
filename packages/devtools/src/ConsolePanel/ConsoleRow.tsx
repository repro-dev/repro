import { Block, Grid, InlineBlock, Row } from '@jsxstyle/react'
import { formatTime } from '@repro/date-utils'
import { color, spacing } from '@repro/design'
import { ConsoleEvent, LogLevel, StackEntry } from '@repro/domain'
import { AlertCircle, AlertTriangle } from 'lucide-react'
import React from 'react'
import { SeekAction } from '../SeekAction'
import { PartRenderer } from './PartRenderer'

const bgColors = {
  [LogLevel.Error]: color.dangerSubtle,
  [LogLevel.Info]: color.bg.surface,
  [LogLevel.Warning]: color.warningSubtle,
  [LogLevel.Verbose]: color.bg.surface,
}

const textColors = {
  [LogLevel.Error]: color.danger,
  [LogLevel.Info]: color.text.secondary,
  [LogLevel.Warning]: color.warning,
  [LogLevel.Verbose]: color.text.secondary,
}

const icons = {
  [LogLevel.Error]: <AlertTriangle size={14} color={color.danger} />,
  [LogLevel.Info]: <AlertCircle size={14} color={color.info} />,
  [LogLevel.Warning]: <AlertTriangle size={14} color={color.warning} />,
  [LogLevel.Verbose]: <AlertCircle size={14} color={color.text.muted} />,
}

interface Props {
  event: ConsoleEvent
  index: number
}

export const ConsoleRow: React.FC<Props> = ({
  event: {
    time,
    data: { level, parts, stack },
  },
  index,
}) => {
  return (
    <Block
      props={
        { 'data-target': 'console-row' } as React.HTMLAttributes<HTMLDivElement>
      }
    >
      <Grid
        gridTemplateColumns="auto auto 1fr auto"
        columnGap={spacing.lg}
        paddingV={spacing.sm}
        paddingH={spacing.xl}
        fontSize={11}
        color={textColors[level]}
        backgroundColor={bgColors[level]}
      >
        <Block position="relative" color={color.text.muted} lineHeight={1.25}>
          {formatTime(time, 'millis')}

          <Block position="absolute" top={-3} left={-10}>
            <SeekAction eventIndex={index} />
          </Block>
        </Block>

        <Block>{icons[level]}</Block>

        <Row flexWrap="wrap" gap={spacing.lg}>
          {parts.map((part, j) => {
            return <PartRenderer part={part} key={j} />
          })}
        </Row>

        {stack[0] ? <StackReference entry={stack[0]} /> : <Block />}
      </Grid>
    </Block>
  )
}

interface StackReferenceProps {
  entry: StackEntry
}

const StackReference: React.FC<StackReferenceProps> = ({ entry }) => (
  <InlineBlock lineHeight={1.25}>
    {entry.fileName}:{entry.lineNumber}
  </InlineBlock>
)
