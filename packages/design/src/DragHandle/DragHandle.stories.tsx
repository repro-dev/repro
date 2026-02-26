import { Block, Col, Row } from '@jsxstyle/react'
import type { Meta, StoryObj } from '@storybook/react'
import React, { useCallback, useState } from 'react'
import { color } from '../tokens/colors'
import { fontSize } from '../tokens/typography'
import { DragHandle } from './DragHandle'

const meta: Meta<typeof DragHandle> = {
  title: 'Components/DragHandle',
  component: DragHandle,
  tags: ['autodocs', 'design-system'],
}

export default meta

type Story = StoryObj<typeof DragHandle>

/** Bottom-edge drag handle on a resizable panel. */
export const Default: Story = {
  render: () => {
    const [height, setHeight] = useState(200)
    const [baseHeight, setBaseHeight] = useState(200)

    const handleDragStart = useCallback(() => {
      setBaseHeight(height)
    }, [height])

    const handleDrag = useCallback(
      (offset: number) => {
        setHeight(Math.max(80, baseHeight + offset))
      },
      [baseHeight]
    )

    const handleDragEnd = useCallback(() => {}, [])

    return (
      <Block position="relative" width={400} height={height} padding={16}>
        <Block
          position="absolute"
          top={0}
          left={0}
          right={0}
          bottom={0}
          backgroundColor={color.bg.subtle}
          borderRadius={4}
          border={`1px solid ${color.border.default}`}
        />
        <Block
          position="relative"
          fontSize={fontSize.sm}
          color={color.text.secondary}
        >
          Panel height: {Math.round(height)}px — drag the bottom edge to resize
        </Block>
        <DragHandle
          edge="bottom"
          onDragStart={handleDragStart}
          onDrag={handleDrag}
          onDragEnd={handleDragEnd}
          aria-label="Resize panel height"
        />
      </Block>
    )
  },
}

const edges = ['top', 'bottom', 'left', 'right'] as const

/** All four edge positions shown side-by-side. */
export const AllEdges: Story = {
  render: () => (
    <Row gap={24} padding={16} flexWrap="wrap">
      {edges.map(edge => (
        <Col key={edge} gap={8} alignItems="center">
          <Block
            position="relative"
            width={120}
            height={120}
            backgroundColor={color.bg.subtle}
            borderRadius={4}
            border={`1px solid ${color.border.default}`}
          >
            <Block
              position="absolute"
              top="50%"
              left="50%"
              transform="translate(-50%, -50%)"
              fontSize={fontSize.xs}
              color={color.text.muted}
              whiteSpace="nowrap"
            >
              {edge}
            </Block>
            <DragHandle
              edge={edge}
              onDragStart={() => {}}
              onDrag={() => {}}
              onDragEnd={() => {}}
              aria-label={`Resize ${edge}`}
            />
          </Block>
        </Col>
      ))}
    </Row>
  ),
}
