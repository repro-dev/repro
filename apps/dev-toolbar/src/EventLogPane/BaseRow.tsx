import { Block, Col, Row } from '@jsxstyle/react'
import { formatTime } from '@repro/date-utils'
import { colors } from '@repro/design'
import { SourceEvent, SourceEventType } from '@repro/domain'
import { Unboxed, isLens, unwrapLens } from '@repro/tdl'
import prettyBytes from 'pretty-bytes'
import React, { PropsWithChildren } from 'react'
import { useSelectedEvent } from '~/hooks'

interface Props {
  event: Unboxed<SourceEvent>
  index: number
  style: React.CSSProperties
}

export const BaseRow: React.FC<PropsWithChildren<Props>> = ({
  children,
  event,
  index,
  style,
}) => {
  const [, setSelectedEvent] = useSelectedEvent()

  return (
    <Row
      alignItems="center"
      gap={10}
      paddingInline={10}
      backgroundColor={index % 2 ? colors.white : colors.slate['50']}
      borderColor={colors.slate['200']}
      borderStyle="solid"
      borderWidth="0 0 1px"
      color={colors.slate['900']}
      fontSize={12}
      cursor="pointer"
      hoverBackgroundColor={colors.blue['100']}
      transition="all 100ms linear"
      style={style}
      props={{ onClick: () => setSelectedEvent(event) }}
    >
      <Col
        width={80}
        alignSelf="stretch"
        justifyContent="center"
        gap={5}
        borderColor={colors.slate['200']}
        borderStyle="solid"
        borderWidth="0 1px 0 0"
      >
        <Block>{formatTime(event.time, 'millis')}</Block>
        <Block fontSize={11} fontWeight={700} color={colors.blue['700']}>
          {SourceEventType[event.type]}
        </Block>
      </Col>

      <Block>{children}</Block>

      {isLens(event) && (
        <Block marginLeft="auto" color={colors.slate['500']}>
          {prettyBytes(unwrapLens(event).byteLength)}
        </Block>
      )}
    </Row>
  )
}
