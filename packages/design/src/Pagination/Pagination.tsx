import { Block, Row } from '@jsxstyle/react'
import { visuallyHidden } from '@repro/a11y'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import React, { forwardRef } from 'react'
import { Button } from '../Button'
import { color } from '../tokens/colors'
import { radius } from '../tokens/elevation'
import { spacing } from '../tokens/spacing'
import { textStyles } from '../tokens/typography'

export interface PaginationProps {
  /** Current one-based page index. Values below 1 are normalized to page 1. */
  currentPage: number
  /** Known total page count. Omit for cursor-backed previous/current/next mode. */
  totalPages?: number
  /** Whether a cursor-backed consumer can navigate to the previous page. */
  hasPreviousPage?: boolean
  /** Whether a cursor-backed consumer can navigate to the next page. */
  hasNextPage?: boolean
  /** Disables every control while navigation is in-flight. */
  pending?: boolean
  /** Disables every control. */
  disabled?: boolean
  /** Accessible label for the pagination navigation landmark. */
  ariaLabel?: string
  /** Accessible label for the previous-page control. */
  previousLabel?: string
  /** Accessible label for the next-page control. */
  nextLabel?: string
  /** Accessible text paired with visual ellipsis markers. */
  ellipsisLabel?: string
  /** Formats accessible labels for non-current page buttons. */
  getPageLabel?: (page: number) => string
  /** Formats accessible labels for the current page button. */
  getCurrentPageLabel?: (page: number) => string
  /** Called with the one-based destination page for enabled, actionable controls. */
  onPageChange: (page: number) => void
}

type PageRangeItem = number | 'ellipsis'

const EDGE_PAGE_COUNT = 3
const CURRENT_WINDOW = 1
const SMALL_PAGE_COUNT = 7

function normalizePage(page: number) {
  return Math.max(1, Math.floor(page))
}

function createPageRange(
  currentPage: number,
  totalPages: number
): PageRangeItem[] {
  const safeTotalPages = Math.max(1, Math.floor(totalPages))
  const safeCurrentPage = Math.min(normalizePage(currentPage), safeTotalPages)

  if (safeTotalPages <= SMALL_PAGE_COUNT) {
    return Array.from({ length: safeTotalPages }, (_, index) => index + 1)
  }

  const pages = new Set<number>()

  for (let page = 1; page <= EDGE_PAGE_COUNT; page += 1) {
    pages.add(page)
  }

  for (
    let page = safeTotalPages - EDGE_PAGE_COUNT + 1;
    page <= safeTotalPages;
    page += 1
  ) {
    pages.add(page)
  }

  for (
    let page = safeCurrentPage - CURRENT_WINDOW;
    page <= safeCurrentPage + CURRENT_WINDOW;
    page += 1
  ) {
    if (page >= 1 && page <= safeTotalPages) {
      pages.add(page)
    }
  }

  const sortedPages = Array.from(pages).sort((a, b) => a - b)
  const range: PageRangeItem[] = []
  let previousPage: number | null = null

  for (const page of sortedPages) {
    if (previousPage != null && page - previousPage > 1) {
      range.push('ellipsis')
    }

    range.push(page)
    previousPage = page
  }

  return range
}

/**
 * Pagination navigation for list and table views.
 *
 * Use with `totalPages` when direct numbered navigation is available. Omit
 * `totalPages` for cursor-backed lists that can only expose previous/current/next.
 * The component owns compact range rendering, boundary states, pending disabling,
 * and accessible labels for arrow buttons, page buttons, current page, and ellipsis.
 */
export const Pagination = forwardRef<HTMLElement, PaginationProps>(
  (
    {
      currentPage,
      totalPages,
      hasPreviousPage,
      hasNextPage,
      pending = false,
      disabled = false,
      ariaLabel = 'Pagination',
      previousLabel = 'Previous page',
      nextLabel = 'Next page',
      ellipsisLabel = 'Skipped pages',
      getPageLabel = page => `Go to page ${page}`,
      getCurrentPageLabel = page => `Page ${page}, current page`,
      onPageChange,
    },
    ref
  ) => {
    const safeCurrentPage = normalizePage(currentPage)
    const safeTotalPages =
      totalPages == null ? undefined : Math.max(1, Math.floor(totalPages))
    const controlsDisabled = disabled || pending
    const previousDisabled =
      controlsDisabled ||
      (safeTotalPages == null ? !hasPreviousPage : safeCurrentPage <= 1)
    const nextDisabled =
      controlsDisabled ||
      (safeTotalPages == null
        ? !hasNextPage
        : safeCurrentPage >= safeTotalPages)

    const requestPageChange = (page: number) => {
      if (controlsDisabled) return
      if (page === safeCurrentPage) return
      if (safeTotalPages != null && (page < 1 || page > safeTotalPages)) return

      onPageChange(page)
    }

    return (
      <Row
        component="nav"
        alignItems="center"
        justifyContent="center"
        gap={spacing.sm}
        flexWrap="wrap"
        props={{
          ref,
          'aria-label': ariaLabel,
          'aria-busy': pending ? true : undefined,
        }}
      >
        <Button
          variant="outlined"
          context="neutral"
          size="small"
          disabled={previousDisabled}
          props={{ 'aria-label': previousLabel }}
          onClick={() => requestPageChange(safeCurrentPage - 1)}
        >
          <ChevronLeft size={16} aria-hidden="true" />
        </Button>

        {safeTotalPages == null ? (
          <Block
            {...textStyles.bodySmall}
            color={color.text.secondary}
            backgroundColor={color.bg.surface}
            borderColor={color.border.default}
            borderStyle="solid"
            borderWidth={1}
            borderRadius={radius.md}
            paddingH={spacing.md}
            paddingV={spacing.xs}
          >
            Page {safeCurrentPage}
          </Block>
        ) : (
          createPageRange(safeCurrentPage, safeTotalPages).map((item, index) =>
            item === 'ellipsis' ? (
              <Block
                key={`ellipsis-${index}`}
                {...textStyles.bodySmall}
                color={color.text.muted}
                paddingH={spacing.xs}
              >
                <span aria-hidden="true">…</span>
                <span style={visuallyHidden}>{ellipsisLabel}</span>
              </Block>
            ) : (
              <Button
                key={item}
                variant={item === safeCurrentPage ? 'contained' : 'outlined'}
                context={item === safeCurrentPage ? 'info' : 'neutral'}
                size="small"
                disabled={controlsDisabled}
                props={{
                  'aria-label':
                    item === safeCurrentPage
                      ? getCurrentPageLabel(item)
                      : getPageLabel(item),
                  'aria-current': item === safeCurrentPage ? 'page' : undefined,
                }}
                onClick={() => requestPageChange(item)}
              >
                {item}
              </Button>
            )
          )
        )}

        <Button
          variant="outlined"
          context="neutral"
          size="small"
          disabled={nextDisabled}
          props={{ 'aria-label': nextLabel }}
          onClick={() => requestPageChange(safeCurrentPage + 1)}
        >
          <ChevronRight size={16} aria-hidden="true" />
        </Button>
      </Row>
    )
  }
)

Pagination.displayName = 'Pagination'
