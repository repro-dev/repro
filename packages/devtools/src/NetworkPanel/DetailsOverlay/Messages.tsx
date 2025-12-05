import { Block, Grid, Inline, Row } from '@jsxstyle/react'
import { formatTime } from '@repro/date-utils'
import { colors, JSONView } from '@repro/design'
import { Stats } from '@repro/diagnostics'
import {
  NetworkMessageType,
  WebSocketInbound,
  WebSocketMessageType,
  WebSocketOutbound,
} from '@repro/domain'
import { ElapsedMarker } from '@repro/playback'
import { WebSocketGroup } from '@repro/source-utils'
// FIXME: Re-export `JsxstyleProps`
// @ts-expect-error Cannot find declaration in npm-forks
import { JsxstyleProps } from 'jsxstyle/lib/types'
import {
  X as CloseIcon,
  ChevronsDown as InboundIcon,
  ChevronsUp as OutboundIcon,
} from 'lucide-react'
import prettyBytes from 'pretty-bytes'
import React, { PropsWithChildren, useState } from 'react'
import AutoSizer from 'react-virtualized-auto-sizer'
import { FixedSizeList, ListChildComponentProps } from 'react-window'
import { SeekAction } from '../../SeekAction'

interface Props {
  group: WebSocketGroup
}

function binaryToHex(buf: ArrayBuffer) {
  return Stats.time('NetworkPanel -> Messages -> binaryToHex', () => {
    const bytes = new Uint8Array(buf)
    let output = ''

    for (const byte of bytes) {
      output += byte.toString(16).padStart(2, '0') + ' '
    }

    return (
      <Inline
        fontFamily="monospace"
        overflow="hidden"
        whiteSpace="inherit"
        textOverflow="ellipsis"
      >
        {output}
      </Inline>
    )
  })
}

function binaryToString(buf: ArrayBuffer) {
  return Stats.time('NetworkPanel -> Messages -> binaryToString', () => {
    return (
      <Inline
        fontFamily="monospace"
        overflow="hidden"
        whiteSpace="inherit"
        textOverflow="ellipsis"
      >
        {new TextDecoder().decode(buf)}
      </Inline>
    )
  })
}

function binaryToJSONView(buf: ArrayBuffer) {
  return Stats.time('NetworkPanel -> Messages -> binaryToJSONView', () => {
    return <JSONView data={JSON.parse(new TextDecoder().decode(buf))} />
  })
}

export const Messages: React.FC<Props> = ({ group }) => {
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null)

  const selectedEvent =
    selectedIndex !== null ? group.messages?.[selectedIndex] ?? null : null

  return (
    <Block position="relative" height="100%" fontSize={11}>
      <AutoSizer disableWidth>
        {({ height }) => (
          <FixedSizeList
            height={height}
            width="100%"
            itemSize={32}
            itemCount={group.messages?.length || 0}
            itemData={{
              rows: group.messages ?? [],
              selectedIndex,
              onSelect: setSelectedIndex,
            }}
          >
            {MessageRow}
          </FixedSizeList>
        )}
      </AutoSizer>

      {selectedEvent !== null && (
        <Body
          message={selectedEvent.data}
          onClose={() => setSelectedIndex(null)}
        />
      )}
    </Block>
  )
}

interface MessageRowData {
  time: number
  index: number
  data: WebSocketInbound | WebSocketOutbound
}

interface MessageListProps {
  rows: Array<MessageRowData>
  selectedIndex: number | null
  onSelect(eventIndex: number): void
}

const MessageRow: React.FC<ListChildComponentProps<MessageListProps>> = ({
  index,
  style,
  data: { rows, selectedIndex, onSelect },
}) => {
  const row = rows[index]

  if (!row) {
    return null
  }

  const time = row.time
  const message = row.data
  const isSelected = index === selectedIndex

  const bgColor =
    message.type === NetworkMessageType.WebSocketOutbound
      ? colors.emerald['100']
      : colors.white

  const hoverBgColor =
    message.type === NetworkMessageType.WebSocketOutbound
      ? colors.emerald['200']
      : colors.slate['100']

  const selectedBgColor = colors.blue['100']

  const nextIndex = rows[index + 1]?.index ?? Number.MAX_SAFE_INTEGER

  return (
    <Grid
      gridTemplateColumns="auto auto 1fr 80px"
      gridTemplateRows="28px 4px"
      backgroundColor={isSelected ? selectedBgColor : bgColor}
      hoverBackgroundColor={isSelected ? selectedBgColor : hoverBgColor}
      cursor="default"
      style={style}
      props={{ onClick: () => onSelect(index) }}
    >
      <Cell position="relative" color={colors.slate['500']} borderLeft="none">
        {formatTime(time, 'millis')}

        <Block position="absolute" top={1} left={5}>
          <SeekAction eventIndex={row.index} />
        </Block>
      </Cell>

      <Cell>
        {message.type === NetworkMessageType.WebSocketOutbound ? (
          <OutboundIcon color={colors.emerald['700']} size={14} />
        ) : (
          <InboundIcon color={colors.rose['700']} size={14} />
        )}
      </Cell>

      <Cell overflow="hidden" whiteSpace="nowrap">
        {message.messageType === WebSocketMessageType.Binary
          ? binaryToHex(message.data)
          : binaryToString(message.data)}
      </Cell>

      <Cell color={colors.slate['500']}>
        {prettyBytes(message.data.byteLength)}
      </Cell>

      <Block gridColumn="1 / span 4">
        <ElapsedMarker prevIndex={row.index} nextIndex={nextIndex} />
      </Block>
    </Grid>
  )
}

const Cell: React.FC<PropsWithChildren<JsxstyleProps<false>>> = ({
  children,
  ...props
}) => (
  <Row
    alignItems="center"
    paddingH={10}
    borderLeft={`1px solid ${colors.slate['200']}`}
    lineHeight={1.25}
    {...props}
  >
    {children}
  </Row>
)

interface BodyProps {
  message: WebSocketInbound | WebSocketOutbound
  onClose(): void
}

const Body: React.FC<BodyProps> = ({ message, onClose }) => (
  <Block
    position="absolute"
    top={-10}
    bottom={-10}
    right={-10}
    height="calc(100% + 20px)"
    width="75%"
    overflow="auto"
    backgroundColor={colors.white}
    borderLeft={`1px solid ${colors.slate['200']}`}
    boxShadow={`
      0 4px 16px rgba(0, 0, 0, 0.1),
      0 1px 2px rgba(0, 0, 0, 0.1)
    `}
  >
    <Block
      paddingH={20}
      paddingTop={50}
      paddingBottom={20}
      whiteSpace="pre-wrap"
      lineHeight={1.5}
    >
      {message.messageType === WebSocketMessageType.Binary
        ? binaryToHex(message.data)
        : binaryToJSONView(message.data)}
    </Block>

    <Row
      position="absolute"
      top={10}
      left={10}
      width={32}
      height={32}
      alignItems="center"
      justifyContent="center"
      hoverBackgroundColor={colors.slate['100']}
      borderRadius="99rem"
      cursor="pointer"
      props={{ onClick: onClose }}
    >
      <CloseIcon size={16} />
    </Row>
  </Block>
)
