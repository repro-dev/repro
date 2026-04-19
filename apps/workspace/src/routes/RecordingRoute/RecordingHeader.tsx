import { Row } from '@jsxstyle/react'
import { formatDate, formatTime } from '@repro/date-utils'
import { Badge, Breadcrumbs, Link, Text, color, spacing } from '@repro/design'
import { RecordingInfo, RecordingMode } from '@repro/domain'
import { ucfirst } from '@repro/string-utils'
import React from 'react'
import { Link as RouterLink } from 'react-router-dom'

interface Props {
  projectId?: string | null
  projectName?: string | null
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

function getSafeRecordingHref(url: string): string | null {
  try {
    const parsed = new URL(url)

    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return parsed.toString()
    }

    return null
  } catch {
    return null
  }
}

export const RecordingHeader: React.FC<Props> = ({
  projectId,
  projectName,
  recording,
}) => {
  const browserLabel = getBrowserLabel(recording)
  const operatingSystemLabel = getOperatingSystemLabel(recording)
  const recordingHref = getSafeRecordingHref(recording.url)
  const recordingLinkStyles = {
    display: 'block',
    maxWidth: '18rem',
    minWidth: 0,
    flexShrink: 1,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  }

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
        {projectName && projectId ? (
          <Breadcrumbs.Item
            component={RouterLink}
            props={{ to: `/projects/${projectId}` }}
          >
            {projectName}
          </Breadcrumbs.Item>
        ) : null}
        <Breadcrumbs.Item current>{recording.title}</Breadcrumbs.Item>
      </Breadcrumbs>

      {recordingHref ? (
        <Link
          href={recordingHref}
          target="_blank"
          rel="noopener noreferrer"
          props={{ style: recordingLinkStyles }}
        >
          {recording.url}
        </Link>
      ) : (
        <Text variant="caption" color={color.text.muted}>
          {recording.url}
        </Text>
      )}

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
