import { colors } from '@repro/design'
import { ConsoleEvent, LogLevel, MessagePartType } from '@repro/domain'
import { AlertCircle, AlertTriangle } from 'lucide-react'
import React from 'react'
import { useDevToolsView } from '../hooks'
import { View } from '../types'
import { BaseEntry } from './BaseEntry'

interface Props {
  eventIndex: number
  event: ConsoleEvent
}

const textColors = {
  [LogLevel.Error]: colors.rose['700'],
  [LogLevel.Info]: colors.slate['700'],
  [LogLevel.Warning]: colors.amber['700'],
  [LogLevel.Verbose]: colors.slate['700'],
}

const icons = {
  [LogLevel.Error]: <AlertTriangle size={16} color={colors.rose['700']} />,
  [LogLevel.Info]: <AlertCircle size={16} color={colors.blue['700']} />,
  [LogLevel.Warning]: <AlertTriangle size={16} color={colors.amber['700']} />,
  [LogLevel.Verbose]: <AlertCircle size={16} color={colors.slate['500']} />,
}

export const ConsoleEntry: React.FC<Props> = ({ eventIndex, event }) => {
  const [, setView] = useDevToolsView()
  const level = event.data.level
  const firstPart = event.data.parts[0]

  const textColor = textColors[level]
  const icon = icons[level]

  const value = firstPart?.map(part => {
    if (part.type === MessagePartType.String) {
      return part.value
    }

    return null
  })

  function onClick() {
    setView(View.Console)
  }

  return (
    <BaseEntry
      eventIndex={eventIndex}
      event={event}
      color={textColor}
      icon={icon}
      onClick={onClick}
    >
      {value?.orElse(null)}
    </BaseEntry>
  )
}
