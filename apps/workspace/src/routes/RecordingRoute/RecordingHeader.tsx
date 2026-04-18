import { Row } from '@jsxstyle/react'
import { formatDate, formatTime } from '@repro/date-utils'
import { Badge, Breadcrumbs, Link, Text, color, spacing } from '@repro/design'
import { RecordingInfo, RecordingMode } from '@repro/domain'
import { ucfirst } from '@repro/string-utils'
import React from 'react'
import { Link as RouterLink } from 'react-router-dom'

interface Props {
  projectId: string
  projectName: string
  recording: RecordingInfo
}

function getModeLabel(mode: RecordingMode): string {
  switch (mode) {
    case RecordingMode.Live:
      return 'Live'
    case RecordingMode.Replay:
      return 'Replay'
    case RecordingMode.Snapshot:
      return 'Snapshot'
    case RecordingMode.None:
      return 'Inactive'
  }
}

function getModeContext(mode: RecordingMode): 'info' | 'neutral' {
  switch (mode) {
    case RecordingMode.Live:
    case RecordingMode.Replay:
      return 'info'
    case RecordingMode.Snapshot:
    case RecordingMode.None:
      return 'neutral'
  }
}

function getBrowserLabel(recording: RecordingInfo): string | null {
  if (!recording.browserName) {
    return null
  }

  const browserName = ucfirst(recording.browserName)
  return recording.browserVersion
    ? `${browserName} ${recording.browserVersion}`
    : browserName
}

function getOperatingSystemLabel(recording: RecordingInfo): string | null {
  return recording.operatingSystem
}

export const RecordingHeader: React.FC<Props> = ({
  projectId,
  projectName,
  recording,
}) => {
  const browserLabel = getBrowserLabel(recording)
  const operatingSystemLabel = getOperatingSystemLabel(recording)

  return (
    <Row
      alignItems="center"
      gap={spacing.md}
      minWidth={0}
      width="100%"
      overflow="hidden"
      flexWrap="nowrap"
    >
      <Link component={RouterLink} props={{ to: '/' }}>
        ← Sessions
      </Link>

      <Breadcrumbs ariaLabel="Recording breadcrumb">
        <Breadcrumbs.Item
          component={RouterLink}
          props={{ to: `/projects/${projectId}` }}
        >
          {projectName}
        </Breadcrumbs.Item>
        <Breadcrumbs.Item current>{recording.title}</Breadcrumbs.Item>
      </Breadcrumbs>

      <Link
        href={recording.url}
        target="_blank"
        rel="noopener noreferrer"
        props={{
          style: {
            display: 'block',
            maxWidth: '18rem',
            minWidth: 0,
            flexShrink: 1,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          },
        }}
      >
        {recording.url}
      </Link>

      <Badge context={getModeContext(recording.mode)} size="small">
        {getModeLabel(recording.mode)}
      </Badge>

      <Text variant="caption" color={color.text.muted}>
        {formatDate(recording.createdAt)}
      </Text>

      <Text variant="caption" color={color.text.muted}>
        {formatTime(recording.duration, 'seconds')}
      </Text>

      {browserLabel && (
        <Text variant="caption" color={color.text.muted}>
          {browserLabel}
        </Text>
      )}

      {operatingSystemLabel && (
        <Text variant="caption" color={color.text.muted}>
          {operatingSystemLabel}
        </Text>
      )}
    </Row>
  )
}
