import { Block, Col } from '@jsxstyle/react'
import React, { forwardRef } from 'react'
import { color } from '../tokens/colors'
import { spacing } from '../tokens/spacing'

export interface AppShellSidebarProps {
  ariaLabel?: string
  header?: React.ReactNode
  footer?: React.ReactNode
  children?: React.ReactNode
}

export const AppShellSidebar = forwardRef<HTMLElement, AppShellSidebarProps>(
  ({ ariaLabel = 'Sidebar', header, footer, children }, ref) => {
    const hasSlots = header !== undefined || footer !== undefined

    return (
      <Col
        component="aside"
        height="100%"
        overflowY="auto"
        backgroundColor={color.bg.surface}
        borderRight={`1px solid ${color.border.default}`}
        props={{ ref, 'aria-label': ariaLabel }}
      >
        {hasSlots ? (
          <>
            {header !== undefined && (
              <Block padding={spacing.lg}>{header}</Block>
            )}
            <Col flex={1}>{children}</Col>
            {footer !== undefined && (
              <Block borderTop={`1px solid ${color.border.default}`}>
                {footer}
              </Block>
            )}
          </>
        ) : (
          children
        )}
      </Col>
    )
  }
)

AppShellSidebar.displayName = 'AppShellSidebar'
