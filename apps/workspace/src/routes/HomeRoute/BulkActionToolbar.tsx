import { Block, Row } from '@jsxstyle/react'
import { Button, color, radius, spacing, textStyles } from '@repro/design'
import { TrashIcon } from 'lucide-react'
import React from 'react'

interface BulkActionToolbarProps {
  selectedCount: number
  onDelete: () => void
  onClearSelection: () => void
}

export const BulkActionToolbar: React.FC<BulkActionToolbarProps> = ({
  selectedCount,
  onDelete,
  onClearSelection,
}) => {
  if (selectedCount === 0) {
    return null
  }

  return (
    <Row
      alignItems="center"
      gap={spacing.md}
      paddingH={spacing.md}
      paddingV={spacing.sm}
      backgroundColor={color.bg.subtle}
      borderRadius={radius.md}
      justifyContent="space-between"
    >
      <Block {...textStyles.bodySmall} color={color.text.secondary}>
        {selectedCount} selected
      </Block>

      <Row alignItems="center" gap={spacing.sm}>
        <Button
          variant="outlined"
          context="danger"
          size="small"
          rounded
          onClick={onDelete}
        >
          <Row alignItems="center" gap={spacing.xs}>
            <TrashIcon size={14} />
            <Block component="span">Delete</Block>
          </Row>
        </Button>

        <Button
          variant="text"
          context="neutral"
          size="small"
          onClick={onClearSelection}
        >
          Clear selection
        </Button>
      </Row>
    </Row>
  )
}
