import { Block } from '@jsxstyle/react'
import type { Meta, StoryObj } from '@storybook/react'
import React from 'react'
import { color } from '../tokens/colors'
import { fontSize } from '../tokens/typography'
import { Portal } from './Portal'
import { PortalRootProvider } from './PortalRootProvider'

const meta: Meta<typeof Portal> = {
  title: 'Components/Utilities/Portal',
  component: Portal,
  tags: ['autodocs', 'design-system'],
  decorators: [
    Story => (
      <PortalRootProvider>
        <Story />
      </PortalRootProvider>
    ),
  ],
}

export default meta

type Story = StoryObj<typeof Portal>

/**
 * Portal renders its children into a separate mount point outside the
 * normal React tree. The green box below is rendered via Portal and
 * appears at the top-left of the viewport.
 */
export const Default: Story = {
  render: () => (
    <Block>
      <Block
        padding={16}
        fontSize={fontSize.sm}
        color={color.text.secondary}
        backgroundColor={color.bg.subtle}
        borderRadius={4}
      >
        This text is in the normal React tree.
      </Block>

      <Portal>
        <Block
          position="fixed"
          top={8}
          right={8}
          padding={12}
          fontSize={fontSize.sm}
          fontWeight={600}
          color={color.text.inverse}
          backgroundColor={color.success}
          borderRadius={4}
          zIndex={999}
        >
          Portaled content (top-right corner)
        </Block>
      </Portal>
    </Block>
  ),
}
