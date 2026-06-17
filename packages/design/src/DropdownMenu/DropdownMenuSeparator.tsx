import { Block } from '@jsxstyle/react'
import React from 'react'
import { color } from '../tokens/colors'
import { spacing } from '../tokens/spacing'

/**
 * Visual divider between groups of menu items in a DropdownMenu.
 *
 * Renders as a horizontal rule with `role="separator"`. Use between
 * logical groups of `DropdownMenu.Item` elements to improve scannability.
 */
export const DropdownMenuSeparator: React.FC = () => {
  return (
    <Block
      component="hr"
      backgroundColor={color.border.default}
      border="none"
      height={1}
      margin={spacing.none}
      marginTop={spacing.sm}
      marginBottom={spacing.sm}
      props={{
        role: 'separator',
      }}
    />
  )
}

DropdownMenuSeparator.displayName = 'DropdownMenuSeparator'
