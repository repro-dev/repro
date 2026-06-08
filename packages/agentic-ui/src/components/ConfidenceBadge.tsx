import type { Hypothesis } from '@repro/agentic'
import { Badge, type BadgeProps } from '@repro/design'
import React from 'react'

type ConfidenceLevel = Hypothesis['confidence']

const contextMap: Record<ConfidenceLevel, BadgeProps['context']> = {
  high: 'danger',
  medium: 'warning',
  low: 'neutral',
}

export const ConfidenceBadge: React.FC<{ level: ConfidenceLevel }> = ({
  level,
}) => {
  return (
    <Badge size="small" context={contextMap[level]}>
      {level}
    </Badge>
  )
}
