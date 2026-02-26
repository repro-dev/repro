import { Block, Col, Row } from '@jsxstyle/react'
import type { Meta, StoryObj } from '@storybook/react'
import { Loader2, RefreshCw } from 'lucide-react'
import React from 'react'
import { color } from '../tokens/colors'
import { fontSize } from '../tokens/typography'
import { Pulse } from './Pulse'
import { Spin } from './Spin'

const spinMeta: Meta<typeof Spin> = {
  title: 'Components/FX',
  component: Spin,
  tags: ['autodocs', 'design-system'],
}

export default spinMeta

type SpinStory = StoryObj<typeof Spin>
type PulseStory = StoryObj<typeof Pulse>

/** Infinite rotation — typical loading spinner use case. */
export const SpinDefault: SpinStory = {
  name: 'Spin',
  render: () => (
    <Row gap={24} padding={16} alignItems="center">
      <Col gap={8} alignItems="center">
        <Spin>
          <Loader2 size={24} color={color.brand.primary} />
        </Spin>
        <Block fontSize={fontSize.xs} color={color.text.muted}>
          Loader2
        </Block>
      </Col>
      <Col gap={8} alignItems="center">
        <Spin>
          <RefreshCw size={24} color={color.text.secondary} />
        </Spin>
        <Block fontSize={fontSize.xs} color={color.text.muted}>
          RefreshCw
        </Block>
      </Col>
      <Col gap={8} alignItems="center">
        <Spin>
          <Block
            width={24}
            height={24}
            borderRadius={4}
            backgroundColor={color.brand.primary}
          />
        </Spin>
        <Block fontSize={fontSize.xs} color={color.text.muted}>
          Square
        </Block>
      </Col>
    </Row>
  ),
}

/** Pulsing scale + opacity animation for attention or loading states. */
export const PulseDefault: PulseStory = {
  name: 'Pulse',
  render: () => (
    <Row gap={24} padding={16} alignItems="center">
      <Col gap={8} alignItems="center">
        <Pulse>
          <Block
            width={12}
            height={12}
            borderRadius="99rem"
            backgroundColor={color.success}
          />
        </Pulse>
        <Block fontSize={fontSize.xs} color={color.text.muted}>
          Status dot
        </Block>
      </Col>
      <Col gap={8} alignItems="center">
        <Pulse>
          <Block
            width={24}
            height={24}
            borderRadius="99rem"
            backgroundColor={color.danger}
          />
        </Pulse>
        <Block fontSize={fontSize.xs} color={color.text.muted}>
          Alert dot
        </Block>
      </Col>
      <Col gap={8} alignItems="center">
        <Pulse>
          <Block fontSize={fontSize.md} fontWeight={600} color={color.brand.primary}>
            Recording
          </Block>
        </Pulse>
        <Block fontSize={fontSize.xs} color={color.text.muted}>
          Text
        </Block>
      </Col>
    </Row>
  ),
}
