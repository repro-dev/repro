import { Block, Col } from '@jsxstyle/react'
import type { Meta, StoryObj } from '@storybook/react'
import React from 'react'
import { color } from '../tokens/colors'
import { Link } from './Link'

const meta: Meta<typeof Link> = {
  title: 'Components/Actions/Link',
  component: Link,
  tags: ['autodocs', 'design-system'],
}

export default meta

type Story = StoryObj<typeof Link>

export const Default: Story = {
  args: {
    children: 'Click here',
  },
}

/** Link rendered inline within body text */
export const InlineWithText: Story = {
  render: () => (
    <Block padding={16} color={color.text.default} fontSize={15} lineHeight={1.5}>
      Please read our <Link>terms of service</Link> and{' '}
      <Link>privacy policy</Link> before continuing.
    </Block>
  ),
}

/** Links in different surrounding text contexts */
export const InContext: Story = {
  render: () => (
    <Col gap={16} padding={16}>
      <Block color={color.text.default} fontSize={15}>
        Default text with a <Link>link</Link> inside.
      </Block>
      <Block color={color.text.secondary} fontSize={13}>
        Secondary text with a <Link>link</Link> inside.
      </Block>
      <Block color={color.text.muted} fontSize={11}>
        Muted caption with a <Link>link</Link> inside.
      </Block>
    </Col>
  ),
}
