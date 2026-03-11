import { Block, Col } from '@jsxstyle/react'
import React, { forwardRef } from 'react'
import { color } from '../tokens/colors'
import { spacing } from '../tokens/spacing'
import { textStyles } from '../tokens/typography'

export interface SideNavSectionProps {
  title?: string
  children?: React.ReactNode
}

/**
 * Optional grouping within a `SideNav`. Renders a `<div>` containing
 * an optional heading and a vertical list of `SideNav.Item` children.
 *
 * Use to visually separate navigation into labelled categories.
 */
export const SideNavSection = forwardRef<HTMLDivElement, SideNavSectionProps>(
  ({ title, children }, ref) => {
    return (
      <Col component="div" gap={spacing.xs} props={{ ref, role: 'group' }}>
        {title && (
          <Block
            {...textStyles.overline}
            color={color.text.muted}
            paddingH={spacing.md}
            paddingV={spacing.sm}
          >
            {title}
          </Block>
        )}
        <Col gap={spacing.none}>{children}</Col>
      </Col>
    )
  }
)

SideNavSection.displayName = 'SideNavSection'
