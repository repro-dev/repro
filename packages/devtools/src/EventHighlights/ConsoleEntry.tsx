import { color } from '@repro/design'
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
  [LogLevel.Error]: color.danger,
  [LogLevel.Info]: color.text.secondary,
  [LogLevel.Warning]: color.warning,
  [LogLevel.Verbose]: color.text.secondary,
}

const icons = {
  [LogLevel.Error]: <AlertTriangle size={16} color={color.danger} />,
  [LogLevel.Info]: <AlertCircle size={16} color={color.primary} />,
  [LogLevel.Warning]: <AlertTriangle size={16} color={color.warning} />,
  [LogLevel.Verbose]: <AlertCircle size={16} color={color.text.muted} />,
}

export const ConsoleEntry: React.FC = ({ eventIndex, event }) => {
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
