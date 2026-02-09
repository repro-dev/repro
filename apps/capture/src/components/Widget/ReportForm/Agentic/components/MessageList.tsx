import { Block, Col } from '@jsxstyle/react'
import { Md } from '@m2d/react-markdown'
import { colors } from '@repro/design'
import React from 'react'
import { INPUT_CONTAINER_OFFSET_PX } from '../constants'
import { EmptyState } from '../EmptyState'
import { Entry, Loading } from '../types'

interface MessageListProps {
  entries: Array<Entry>
  loading: Loading
  scrollContainerRef: React.RefObject<HTMLDivElement>
  contentContainerRef: React.RefObject<HTMLDivElement>
}

export const MessageList: React.FC<MessageListProps> = ({
  entries,
  loading,
  scrollContainerRef,
  contentContainerRef,
}) => {
  return (
    <Block
      blockSize={
        loading === 'none'
          ? `calc(100cqb - ${INPUT_CONTAINER_OFFSET_PX}px)`
          : '100cqb'
      }
      fontSize={13}
      marginBlockEnd={20}
      marginInline={-20}
      overflowY="scroll"
      padding={10}
      transition="block-size 250ms ease-in-out"
      props={{ ref: scrollContainerRef }}
    >
      <Col
        gap={10}
        minBlockSize="100%"
        props={{ ref: contentContainerRef }}
      >
        {entries.length === 0 && <EmptyState />}

        {entries.map(entry => (
          <Col key={entry.id} lineHeight={1.5}>
            {entry.role === 'assistant' && (
              <Block>
                <Md>{entry.content}</Md>
              </Block>
            )}

            {entry.role === 'user' && (
              <Block
                marginInlineStart={30}
                paddingInline={10}
                backgroundColor={colors.blue['50']}
                borderColor={colors.blue['100']}
                borderStyle="solid"
                borderWidth={0}
                borderBlockEndWidth={3}
                borderRadius={8}
              >
                <Md>{entry.content}</Md>
              </Block>
            )}
          </Col>
        ))}
      </Col>
    </Block>
  )
}
