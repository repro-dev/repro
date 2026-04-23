import { Block } from '@jsxstyle/react'
import { formatDate, formatTime } from '@repro/date-utils'
import { Badge, Table, color, textStyles } from '@repro/design'
import type { RecordingInfo } from '@repro/domain'
import { RecordingMode } from '@repro/domain'
import React from 'react'
import { Link } from 'react-router-dom'

interface Props {
  recordings: RecordingInfo[]
  projectId: string
  sortColumn: string | null
  sortDirection: 'asc' | 'desc' | null
  onSort(columnId: string): void
}

export const SessionTable: React.FC<Props> = ({
  recordings,
  projectId,
  sortColumn,
  sortDirection,
  onSort,
}) => {
  return (
    <Table
      aria-label="Sessions"
      sortColumn={sortColumn}
      sortDirection={sortDirection}
      onSort={onSort}
    >
      <Table.Header>
        <Table.Row>
          <Table.HeaderCell>Name</Table.HeaderCell>
          <Table.HeaderCell>URL</Table.HeaderCell>
          <Table.HeaderCell>Mode</Table.HeaderCell>
          <Table.HeaderCell columnId="duration" sortable>
            Duration
          </Table.HeaderCell>
          <Table.HeaderCell columnId="date" sortable>
            Date
          </Table.HeaderCell>
        </Table.Row>
      </Table.Header>

      <Table.Body>
        {recordings.map(recording => (
          <Table.Row key={recording.id}>
            <Table.Cell>
              <Block
                component={Link}
                color={color.primary}
                props={{
                  to: `/projects/${projectId}/recordings/${recording.id}`,
                }}
              >
                {recording.title}
              </Block>
            </Table.Cell>

            <Table.Cell>
              <Block
                maxWidth={240}
                textOverflow="ellipsis"
                whiteSpace="nowrap"
                overflow="hidden"
                {...textStyles.bodySmall}
              >
                {recording.url}
              </Block>
            </Table.Cell>

            <Table.Cell>
              <Badge context="neutral" size="small">
                {recording.mode}
              </Badge>
            </Table.Cell>

            <Table.Cell>
              {recording.mode === RecordingMode.Snapshot
                ? ''
                : formatTime(recording.duration, 'seconds')}
            </Table.Cell>

            <Table.Cell>{formatDate(recording.createdAt)}</Table.Cell>
          </Table.Row>
        ))}
      </Table.Body>
    </Table>
  )
}
