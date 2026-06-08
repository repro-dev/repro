import { color, Table, Text } from '@repro/design'
import { CheckIcon } from 'lucide-react'
import React from 'react'

export const EvidenceList: React.FC<{ evidence: Array<string> }> = ({
  evidence,
}) => (
  <Table density="compact">
    {evidence.map((piece, i) => (
      <Table.Row key={i}>
        <Table.Cell>
          <Text variant="caption" color={color.text.muted}>
            <CheckIcon size={12} />
          </Text>
        </Table.Cell>
        <Table.Cell>
          <Text variant="caption">{piece}</Text>
        </Table.Cell>
      </Table.Row>
    ))}
  </Table>
)
