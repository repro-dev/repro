import { Block, Row } from '@jsxstyle/react'
import { formatTime } from '@repro/date-utils'
import { color } from '@repro/design'
import { RequestType } from '@repro/domain'
import { FetchGroup, WebSocketGroup } from '@repro/source-utils'
// FIXME: re-export `JsxstyleProps`
// @ts-expect-error Cannot get declaration from npm-forks
import prettyBytes from 'pretty-bytes'
import prettyMilliseconds from 'pretty-ms'
import React, { useState } from 'react'
import { SeekAction } from '../SeekAction'

interface Props {
  eventGroup: FetchGroup | WebSocketGroup
  selected?: boolean
  onSelect(): void
}

function getContentByteLength(
  group: FetchGroup | WebSocketGroup
): number | null {
  const byteLength =
    group.type === 'fetch'
      ? group.response?.body.byteLength
      : group.messages?.reduce(
          (sum, message) => sum + message.data.data.byteLength,
          0
        )

  return byteLength ?? null
}

function getRequestTiming(group: FetchGroup | WebSocketGroup): number | null {
  if (group.type === 'ws') {
    return null
  }

  if (!group.responseTime) {
    return null
  }

  return group.responseTime - group.requestTime
}

export const NetworkRow: React.FC = ({ eventGroup, onSelect, selected }) => {
  const [hover, setHover] = useState(false)

  function onMouseEnter() {
    setHover(true)
  }

  function onMouseLeave() {
    setHover(false)
  }

  const bgColor = selected
    ? color.primarySubtle
    : hover
    ? color.bg.hover
    : color.bg.surface

  const startTime =
    eventGroup.type === 'fetch' ? eventGroup.requestTime : eventGroup.openTime

  const url =
    eventGroup.type === 'fetch' ? eventGroup.request.url : eventGroup.open.url

  const displayType =
    eventGroup.type === 'fetch'
      ? eventGroup.request.requestType === RequestType.Fetch
        ? 'fetch'
        : 'xhr'
      : 'ws'

  const status =
    eventGroup.type === 'fetch' ? eventGroup.response?.status ?? null : null

  const contentLength = getContentByteLength(eventGroup)
  const requestTiming = getRequestTiming(eventGroup)

  return (
    <Block
      display="contents"
      paddingH={15}
      overflowX="hidden"
      fontSize={11}
      color={
        status !== null && status > 399 ? color.danger : color.text.secondary
      }
      cursor="default"
      props={{ onClick: onSelect, onMouseEnter, onMouseLeave }}
    >
      <Block
        paddingV={10}
        paddingH={10}
        position="relative"
        backgroundColor={bgColor}
        color={color.text.muted}
        lineHeight={1.25}
        cursor="pointer"
      >
        {formatTime(startTime, 'millis')}

        <Block
          position="absolute"
          top="50%"
          left={5}
          transform="translateY(-50%)"
        >
          <SeekAction
            eventIndex={
              eventGroup.type === 'fetch'
                ? eventGroup.requestIndex
                : eventGroup.openIndex
            }
          />
        </Block>
      </Block>

      <Cell
        overflow="hidden"
        backgroundColor={bgColor}
        color={color.text.default}
      >
        <Block overflow="hidden" whiteSpace="nowrap" textOverflow="ellipsis">
          {url}
        </Block>
      </Cell>

      <Cell backgroundColor={bgColor}>{status}</Cell>

      <Cell backgroundColor={bgColor}>{displayType}</Cell>

      <Cell backgroundColor={bgColor}>
        {contentLength !== null ? prettyBytes(contentLength) : null}
      </Cell>

      <Cell backgroundColor={bgColor}>
        {requestTiming ? prettyMilliseconds(requestTiming) : null}
      </Cell>

      <Cell backgroundColor={bgColor} alignSelf="stretch" />
    </Block>
  )
}

const Cell: React.FC = ({ children, ...props }) => (
  <Row
    alignSelf="stretch"
    alignItems="center"
    paddingV={10}
    paddingH={10}
    borderLeft={`1px solid ${color.border.default}`}
    lineHeight={1.25}
    {...props}
  >
    {children}
  </Row>
)
