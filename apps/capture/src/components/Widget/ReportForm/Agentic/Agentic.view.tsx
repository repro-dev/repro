import { Block, Col } from '@jsxstyle/react'
import { Md } from '@m2d/react-markdown'
import { useAtomValue } from '@repro/atom'
import { AgenticInput, colors, FX } from '@repro/design'
import { AgenticInputFormState } from '@repro/design/src/AgenticInput/AgenticInput'
import { ArrowDownIcon, CircleIcon } from 'lucide-react'
import React, { useLayoutEffect, useRef, useState } from 'react'
import { EmptyState } from './EmptyState'
import { useAgenticState } from './context'

const PLACEHOLDER_COPY = [
  'What is causing this bug?',
  'Why are the network requests failing?',
  'Explain the console errors - and how do I fix them?',
]

const GUTTER_PX = 20
const LOADING_CONTAINER_OFFSET_PX = 24 + 2 * GUTTER_PX
const INPUT_CONTAINER_OFFSET_PX = 97 + 2 * GUTTER_PX
const SCROLL_OFFSET_THRESHOLD_PX = 2 * GUTTER_PX

export const AgenticView: React.FC = () => {
  const [inputHasFocus, setInputHasFocus] = useState(false)

  const historyScrollContainerRef = useRef<HTMLDivElement>(null)
  const historyContentContainerRef = useRef<HTMLDivElement>(null)
  const [shouldShowJumpToEndAction, setShouldShowJumpToEndAction] =
    useState(false)

  const agentic = useAgenticState()
  const entries = useAtomValue(agentic.$entries)
  const loading = useAtomValue(agentic.$loading)

  const shouldRaiseInput = inputHasFocus || entries.length > 0

  function handleSubmit({ value }: AgenticInputFormState) {
    agentic.query(value)
    setInputHasFocus(false)
  }

  function handleJumpToEnd() {
    if (historyScrollContainerRef.current) {
      historyScrollContainerRef.current.scrollTo({
        top: historyScrollContainerRef.current.scrollHeight,
      })
    }
  }

  useLayoutEffect(() => {
    const scrollContainer = historyScrollContainerRef.current
    const contentContainer = historyContentContainerRef.current

    if (!scrollContainer || !contentContainer) {
      return () => {}
    }

    const checkHistoryScrollPosition = () => {
      const isAtBottom =
        scrollContainer.scrollHeight -
          scrollContainer.scrollTop -
          scrollContainer.clientHeight <
        SCROLL_OFFSET_THRESHOLD_PX
      setShouldShowJumpToEndAction(!isAtBottom)
    }

    const resizeObserver = new ResizeObserver(checkHistoryScrollPosition)
    resizeObserver.observe(contentContainer)

    scrollContainer.addEventListener('scroll', checkHistoryScrollPosition, {
      passive: true,
    })

    const animationDelay = setTimeout(() => {
      checkHistoryScrollPosition()
    }, 250)

    return () => {
      resizeObserver.disconnect()
      scrollContainer.removeEventListener('scroll', checkHistoryScrollPosition)
      clearTimeout(animationDelay)
    }
  }, [historyScrollContainerRef, setShouldShowJumpToEndAction, loading])

  return (
    <Block
      blockSize={`calc(100% + ${GUTTER_PX}px + ${GUTTER_PX}px)`}
      containerType="size"
      marginBlockStart={`-${GUTTER_PX}px`}
      position="relative"
    >
      <Block
        blockSize={
          loading === 'none'
            ? `calc(100cqb - ${INPUT_CONTAINER_OFFSET_PX}px)`
            : '100cqb'
        }
        fontSize={13}
        marginBlockEnd={GUTTER_PX}
        marginInline={`-${GUTTER_PX}px`}
        overflowY="scroll"
        padding={10}
        transition="block-size 250ms ease-in-out"
        props={{ ref: historyScrollContainerRef }}
      >
        <Col
          gap={10}
          minBlockSize="100%"
          props={{ ref: historyContentContainerRef }}
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

      <Block
        backgroundColor={shouldRaiseInput ? colors.white : colors.slate['100']}
        borderColor={shouldRaiseInput ? colors.slate['200'] : 'transparent'}
        borderStyle="solid"
        borderWidth={0}
        borderBlockStartWidth={1}
        borderRadius={shouldRaiseInput ? 0 : 8}
        bottom={0}
        boxShadow={shouldRaiseInput ? '0 -4px 8px rgba(0, 0, 0, 0.05)' : 'none'}
        left={0}
        marginBlock={shouldRaiseInput ? -20 : 0}
        marginInline={shouldRaiseInput ? -20 : 0}
        overflow="hidden"
        paddingBlock={shouldRaiseInput ? 20 : 0}
        paddingInline={shouldRaiseInput ? 20 : 0}
        position="absolute"
        right={0}
        transform={
          loading === 'none'
            ? `translateY(-${GUTTER_PX}px)`
            : `translateY(calc(100% + ${GUTTER_PX}px))`
        }
        transition="margin ease-in-out 100ms, padding ease-in-out 100ms, transform ease-in-out 250ms"
      >
        <AgenticInput
          placeholders={PLACEHOLDER_COPY}
          onFocusChange={setInputHasFocus}
          onSubmit={handleSubmit}
        />
      </Block>

      <Block
        backgroundColor={colors.blue['800']}
        backgroundImage={`linear-gradient(to bottom right, ${colors.blue['900']}, ${colors.blue['700']})`}
        borderRadius="99em"
        bottom={0}
        boxShadow={loading === 'none' ? 'none' : '0 0 16px rgba(0, 0, 0, 0.15)'}
        left="50%"
        paddingBlock={10}
        paddingInline={15}
        position="absolute"
        translate={
          loading === 'none'
            ? `-50% calc(100% + ${GUTTER_PX}px)`
            : `-50% -${GUTTER_PX}px`
        }
        transition="all ease-in-out 250ms"
      >
        <FX.Pulse>
          <CircleIcon size={8} fill={colors.white} stroke={colors.white} />
        </FX.Pulse>

        <FX.Pulse animationDelay="100ms">
          <CircleIcon size={8} fill={colors.white} stroke={colors.white} />
        </FX.Pulse>

        <FX.Pulse animationDelay="200ms">
          <CircleIcon size={8} fill={colors.white} stroke={colors.white} />
        </FX.Pulse>
      </Block>

      <Block
        position="absolute"
        bottom={0}
        left="50%"
        translate={
          loading === 'none'
            ? `-50% -${INPUT_CONTAINER_OFFSET_PX + GUTTER_PX}px`
            : `-50% -${LOADING_CONTAINER_OFFSET_PX}px`
        }
        backgroundColor={colors.slate['800']}
        backgroundImage={`linear-gradient(to bottom right, ${colors.slate['900']}, ${colors.slate['700']})`}
        boxShadow="0 0 16px rgba(0, 0, 0, 0.15)"
        color={colors.white}
        padding={10}
        borderRadius="99rem"
        cursor="pointer"
        lineHeight={0}
        scale={shouldShowJumpToEndAction ? 1 : 0}
        transformOrigin="center center"
        transition="scale ease-in-out 100ms, translate ease-in-out 250ms"
        pointerEvents={shouldShowJumpToEndAction ? 'auto' : 'none'}
        onClick={handleJumpToEnd}
      >
        <ArrowDownIcon size={16} />
      </Block>
    </Block>
  )
}
