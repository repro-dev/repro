import { Block, Col } from '@jsxstyle/react'
import type { Meta, StoryObj } from '@storybook/react'
import React from 'react'
import { color } from '../tokens/colors'
import { fontSize } from '../tokens/typography'
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
    href: '#',
    children: 'Click here',
  },
}

export const Disabled: Story = {
  args: {
    href: '#',
    disabled: true,
    children: 'Disabled link',
  },
}

export const ExternalLink: Story = {
  args: {
    href: 'https://example.com',
    target: '_blank',
    children: 'Open external site',
  },
}

export const CustomUnderline: Story = {
  // Demo text uses tokens (REP-1658): the hardcoded 13px/15px sizes injected
  // non-token entries into the page's computed size set; fontSize.sm and
  // fontSize.md carry the same roles.
  render: () => (
    <Col gap={16} padding={16}>
      <Block color={color.text.default} fontSize={fontSize.md} lineHeight={1.5}>
        Please read our <Link href="#">terms of service</Link> and{' '}
        <Link href="#">privacy policy</Link> before continuing.
      </Block>
      <Block color={color.text.secondary} fontSize={fontSize.sm}>
        Secondary text with a <Link href="#">link</Link> inside.
      </Block>
      <Block color={color.text.muted} fontSize={fontSize.xs}>
        Muted caption with a <Link href="#">link</Link> inside.
      </Block>
    </Col>
  ),
}
