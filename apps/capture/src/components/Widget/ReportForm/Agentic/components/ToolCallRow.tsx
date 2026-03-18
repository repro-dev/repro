import { Block, Col, Row } from '@jsxstyle/react'
import {
  FX,
  color,
  focusRing,
  radius,
  spacing,
  textStyles,
  transition,
} from '@repro/design'
import { ChevronRightIcon, WrenchIcon } from 'lucide-react'
import React, { useState } from 'react'
import { ToolMessage } from '../types'
import { summarizeToolResult } from '../utils/summarizeToolResult'

interface ToolCallRowProps {
  toolName: string
  result: ToolMessage | null
  isExecuting: boolean
}

export const ToolCallRow: React.FC<ToolCallRowProps> = ({
  toolName,
  result,
  isExecuting,
}) => {
  const [expanded, setExpanded] = useState(false)

  const summary = result
    ? summarizeToolResult(toolName, result.content)
    : null

  return (
    <Col>
      <Row
        alignItems="center"
        gap={spacing.sm}
        paddingV={spacing.sm}
        paddingH={spacing.md}
        cursor="pointer"
        borderRadius={radius.sm}
        hoverBackgroundColor={color.bg.hover}
        transition={transition.fast}
        component="button"
        props={{
          type: 'button',
          onClick: () => setExpanded(prev => !prev),
        }}
        {...focusRing()}
      >
        <Row alignItems="center" flexShrink={0}>
          <WrenchIcon size={12} color={color.text.muted} />
        </Row>

        <Block
          {...textStyles.code}
          color={color.text.secondary}
          flexShrink={0}
        >
          {toolName}
        </Block>

        {isExecuting && result === null ? (
          <Row alignItems="center" gap={spacing.xs}>
            <FX.Pulse>
              <Block
                width={6}
                height={6}
                borderRadius={radius.full}
                backgroundColor={color.text.muted}
              />
            </FX.Pulse>
          </Row>
        ) : (
          <Block
            {...textStyles.caption}
            color={color.text.muted}
            flex={1}
            overflow="hidden"
            textOverflow="ellipsis"
            whiteSpace="nowrap"
          >
            {summary}
          </Block>
        )}

        <Row
          alignItems="center"
          flexShrink={0}
          transform={expanded ? 'rotate(90deg)' : 'rotate(0deg)'}
          transition={transition.fast}
        >
          <ChevronRightIcon size={12} color={color.text.muted} />
        </Row>
      </Row>

      {expanded && result !== null && (
        <Block
          {...textStyles.code}
          color={color.text.secondary}
          backgroundColor={color.bg.muted}
          borderRadius={radius.sm}
          padding={spacing.md}
          overflowX="auto"
          whiteSpace="pre-wrap"
          wordBreak="break-all"
          component="pre"
        >
          {(() => {
            try {
              return JSON.stringify(JSON.parse(result.content), null, 2)
            } catch {
              return result.content
            }
          })()}
        </Block>
      )}
    </Col>
  )
}
