import { Block, Col, Grid } from '@jsxstyle/react'
import { Md } from '@m2d/react-markdown'
import { useAtomValue } from '@repro/atom'
import { AgenticInput, colors, FX } from '@repro/design'
import { AgenticInputFormState } from '@repro/design/src/AgenticInput/AgenticInput'
import { CircleIcon, TextCursorInputIcon } from 'lucide-react'
import React, { useState } from 'react'
import { EmptyState } from './EmptyState'
import { useAgenticState } from './context'

const PLACEHOLDER_COPY = [
  'What is causing this bug?',
  'Why are the network requests failing?',
  'Explain the console errors - and how do I fix them?',
]

export const AgenticView: React.FC = () => {
  const [inputHasFocus, setInputHasFocus] = useState(false)

  const agentic = useAgenticState()
  const entries = useAtomValue(agentic.$entries)
  const loading = useAtomValue(agentic.$loading)

  const latestEntryId = entries.at(-1)?.id

  const shouldRaiseInput = inputHasFocus

  function handleSubmit({ value }: AgenticInputFormState) {
    agentic.query(value)
    setInputHasFocus(false)
  }

  return (
    <Grid gridTemplateRows={'1fr auto'} blockSize="100%" alignItems="stretch">
      <Col
        blockSize="100%"
        overflowY="scroll"
        marginInline={-20}
        marginBlockEnd={20}
        marginBlockStart={-20}
        padding={10}
        gap={10}
        fontSize={13}
        transition="all ease-in-out 100ms"
      >
        {entries.length === 0 && <EmptyState />}

        {entries.map(entry => (
          <Col key={entry.id} lineHeight={1.5}>
            {entry.role === 'assistant' &&
              latestEntryId === entry.id &&
              loading === 'reasoning' && (
                <Block translate="0 3px">
                  <FX.Pulse>
                    <CircleIcon
                      size={12}
                      fill={colors.blue['400']}
                      stroke={colors.blue['400']}
                    />
                  </FX.Pulse>

                  <FX.Pulse animationDelay="100ms">
                    <CircleIcon
                      size={12}
                      fill={colors.blue['400']}
                      stroke={colors.blue['400']}
                    />
                  </FX.Pulse>

                  <FX.Pulse animationDelay="200ms">
                    <CircleIcon
                      size={12}
                      fill={colors.blue['400']}
                      stroke={colors.blue['400']}
                    />
                  </FX.Pulse>
                </Block>
              )}

            {entry.role === 'assistant' && (
              <Block>
                <Md>{entry.content}</Md>
              </Block>
            )}

            {entry.role === 'user' && (
              <Grid
                gridTemplateColumns="auto 1fr"
                alignItems="start"
                gap={5}
                marginInline={-10}
                paddingInline={10}
                backgroundColor={colors.blue['50']}
                borderColor={colors.blue['100']}
                borderStyle="solid"
                borderWidth={0}
                borderBlockEndWidth={3}
              >
                <Block translate="0 50%">
                  <TextCursorInputIcon size={20} color={colors.blue['500']} />
                </Block>

                <Block>
                  <Md>{entry.content}</Md>
                </Block>
              </Grid>
            )}
          </Col>
        ))}
      </Col>

      <Block
        backgroundColor={shouldRaiseInput ? 'transparent' : colors.slate['100']}
        borderBlockStart={
          shouldRaiseInput && `1px solid ${colors.slate['200']}`
        }
        borderRadius={shouldRaiseInput ? 0 : 8}
        boxShadow={shouldRaiseInput ? '0 -4px 8px rgba(0, 0, 0, 0.05)' : 'none'}
        marginBlock={shouldRaiseInput ? -20 : 0}
        marginInline={shouldRaiseInput ? -20 : 0}
        overflow="hidden"
        paddingBlock={shouldRaiseInput ? 20 : 0}
        paddingInline={shouldRaiseInput ? 20 : 0}
        transition="all ease-in-out 100ms"
      >
        <AgenticInput
          placeholders={PLACEHOLDER_COPY}
          onFocusChange={setInputHasFocus}
          onSubmit={handleSubmit}
        />
      </Block>
    </Grid>
  )
}
