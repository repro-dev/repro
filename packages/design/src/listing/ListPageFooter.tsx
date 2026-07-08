import { Row } from '@jsxstyle/react'
import React from 'react'
import { Pagination } from '../Pagination'
import { Text } from '../Text'
import { color, spacing } from '../tokens'

export interface ListPageFooterProps {
  /** Muted text on the left side of the footer (e.g. "Showing up to 50 accounts per page"). */
  footerText: string
  currentPage: number
  totalPages?: number
  hasPreviousPage?: boolean
  hasNextPage?: boolean
  /** Disables pagination controls while a refresh is in-flight. */
  pending?: boolean
  /** Accessible label for the Pagination navigation landmark. */
  ariaLabel: string
  onPageChange: (page: number) => void
}

/**
 * Standard list-page footer extracted from AccountsRoute and RecordingsRoute.
 *
 * Renders a horizontal row with muted descriptive text on the left and
 * Pagination controls on the right. Mirrors the exact layout used in the
 * two exemplar routes.
 */
export function ListPageFooter({
  footerText,
  currentPage,
  totalPages,
  hasPreviousPage,
  hasNextPage,
  pending = false,
  ariaLabel,
  onPageChange,
}: ListPageFooterProps) {
  return (
    <Row
      justifyContent="space-between"
      alignItems="center"
      gap={spacing.md}
      flexWrap="wrap"
    >
      <Text variant="bodySmall" color={color.text.muted}>
        {footerText}
      </Text>
      <Pagination
        currentPage={currentPage}
        totalPages={totalPages}
        hasPreviousPage={hasPreviousPage}
        hasNextPage={hasNextPage}
        pending={pending}
        ariaLabel={ariaLabel}
        onPageChange={onPageChange}
      />
    </Row>
  )
}
