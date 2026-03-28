import React, { forwardRef, useEffect, useRef, useState } from 'react'
import { color } from '../tokens/colors'
import { TableContext, useTableContext } from './TableContext'

export interface TableHeaderProps {
  children?: React.ReactNode
}

/**
 * Table header section (`<thead>`). Wraps `Table.Row` elements containing
 * `Table.HeaderCell` sub-components.
 *
 * When the parent `Table` has `selectionMode="multi"`, a select-all checkbox
 * is automatically rendered as the first cell of each header row via context.
 * `TableRow` reads `isHeaderRow` from context and renders the select-all `<th>`
 * itself — no cloneElement needed.
 *
 * When the parent `Table` has `stickyHeader={true}`, the header becomes
 * position-sticky and remains visible while scrolling through rows. An
 * IntersectionObserver detects when the header has stuck to the top and
 * applies a drop shadow to visually separate it from the content below.
 */
export const TableHeader = forwardRef<
  HTMLTableSectionElement,
  TableHeaderProps
>(({ children }, ref) => {
  const contextValue = useTableContext()
  const { stickyHeader } = contextValue

  const [isScrolled, setIsScrolled] = useState(false)
  // Internal ref for the IntersectionObserver — separate from the forwarded ref.
  // Typed as MutableRefObject so we can assign .current in the callback ref.
  const theadRef = useRef<HTMLTableSectionElement | null>(null)

  useEffect(() => {
    if (!stickyHeader) return

    const el = theadRef.current
    if (el == null) return

    // Detects when position:sticky activates: the thead's top pixel crosses the
    // viewport top. rootMargin of -1px means it fires as soon as the top edge
    // touches the top of the viewport (i.e. the header has stuck).
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry != null) {
          setIsScrolled(!entry.isIntersecting)
        }
      },
      { rootMargin: '-1px 0px 0px 0px', threshold: [1] }
    )

    observer.observe(el)

    return () => {
      observer.disconnect()
    }
  }, [stickyHeader])

  return (
    <thead
      ref={node => {
        // Attach the internal observer ref
        theadRef.current = node
        // Forward to the external ref
        if (typeof ref === 'function') {
          ref(node)
        } else if (ref != null) {
          ref.current = node
        }
      }}
      style={{
        backgroundColor: color.bg.surface,
        position: stickyHeader ? 'sticky' : undefined,
        top: stickyHeader ? 0 : undefined,
        zIndex: stickyHeader ? 1 : undefined,
        // Inset box-shadow acts as the bottom border (moves with the sticky
        // header unlike border-collapse cell borders). Drop shadow is added
        // once the observer signals the header has stuck.
        boxShadow:
          stickyHeader && isScrolled
            ? `inset 0 -1px 0 ${color.border.strong}, 0 2px 4px rgba(0,0,0,0.08)`
            : `inset 0 -1px 0 ${color.border.strong}`,
      }}
    >
      {/* Override isHeaderRow so TableRow renders a <th> select-all cell */}
      <TableContext.Provider value={{ ...contextValue, isHeaderRow: true }}>
        {children}
      </TableContext.Provider>
    </thead>
  )
})

TableHeader.displayName = 'TableHeader'
