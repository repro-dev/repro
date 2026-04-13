import { Block, Col, Row } from '@jsxstyle/react'
import { formatTime } from '@repro/date-utils'
import { SourceEventType } from '@repro/domain'
import { Unboxed, isLens, unwrapLens } from '@repro/tdl'
import prettyBytes from 'pretty-bytes'
import React from 'react'
import { useSelectedEvent } from '~/hooks'

interface Props {
  event: Unboxed
  index: number
  style: React.CSSProperties
}

export const BaseRow: React.FC = ({ children, event, index, style }) => {
  const [, setSelectedEvent] = useSelectedEvent()

  return (
    <Row
      alignItems="center"
      gap={10}
      paddingInline={10}
      backgroundColor={index % 2 ? color.bg.surface : color.bg.subtle}
      borderColor={color.border.default}
      borderStyle="solid"
      borderWidth="0 0 1px"
      color={color.text.default}
      fontSize={12}
      cursor="pointer"
      hoverBackgroundColor={color.primarySubtle}
      transition={transition.fast}
      style={style}
      props={{ onClick: () => setSelectedEvent(event) }}
    >
      <Col
        width={80}
        alignSelf="stretch"
        justifyContent="center"
        gap={5}
        borderColor={color.border.default}
        borderStyle="solid"
        borderWidth="0 1px 0 0"
      >
        <Block>{formatTime(event.time, 'millis')}</Block>
        <Block fontSize={11} fontWeight={700} color={color.primary}>
          {SourceEventType[event.type]}
        </Block>
      </Col>

      <Block>{children}</Block>

      {isLens(event) && (
        <Block marginLeft="auto" color={color.text.muted}>
          {prettyBytes(unwrapLens(event).byteLength)}
        </Block>
      )}
    </Row>
  )
}
