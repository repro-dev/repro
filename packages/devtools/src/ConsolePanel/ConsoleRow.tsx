import { Block, Grid, InlineBlock, Row } from '@jsxstyle/react'
import { formatTime } from '@repro/date-utils'
import { color, colors } from '@repro/design'
import { ConsoleEvent, LogLevel, StackEntry } from '@repro/domain'
import { AlertCircle, AlertTriangle } from 'lucide-react'
import React from 'react'
import { SeekAction } from '../SeekAction'
import { PartRenderer } from './PartRenderer'
/* eslint-disable @repro/oxlint-plugin-design/no-hardcoded-spacing, @repro/oxlint-plugin-design/no-raw-palette */

const bgColors = {
  [LogLevel.Error]: colors.rose['100'],
  [LogLevel.Info]: colors.white,
  [LogLevel.Warning]: colors.amber['50'],
  [LogLevel.Verbose]: colors.white,
}

const textColors = {
  [LogLevel.Error]: colors.rose['700'],
  [LogLevel.Info]: color.text.secondary,
  [LogLevel.Warning]: colors.amber['700'],
  [LogLevel.Verbose]: color.text.secondary,
}

const icons = {
  [LogLevel.Error]: <AlertTriangle size={14} color={colors.rose['700']} />,
  [LogLevel.Info]: <AlertCircle size={14} color={colors.blue['700']} />,
  [LogLevel.Warning]: <AlertTriangle size={14} color={colors.amber['700']} />,
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
        columnGap={10}
        paddingV={6}
        paddingH={15}
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

        <Row flexWrap="wrap" gap={10}>
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
/* eslint-enable */
