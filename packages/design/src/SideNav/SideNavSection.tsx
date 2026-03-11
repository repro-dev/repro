import { Block, Col } from '@jsxstyle/react'
import React, { forwardRef, useId } from 'react'
import { color } from '../tokens/colors'
import { spacing } from '../tokens/spacing'
import { textStyles } from '../tokens/typography'

export interface SideNavSectionProps {
  title?: string
  children?: React.ReactNode
}

export const SideNavSection = forwardRef<HTMLDivElement, SideNavSectionProps>(
  ({ title, children }, ref) => {
    const titleId = useId()

    return (
      <Col
        component="div"
        gap={spacing.xs}
        props={{
          ref,
          ...(title ? { role: 'group', 'aria-labelledby': titleId } : {}),
        }}
      >
        {title && (
          <Block
            {...textStyles.overline}
            color={color.text.muted}
            paddingH={spacing.md}
            paddingV={spacing.sm}
            props={{ id: titleId }}
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
