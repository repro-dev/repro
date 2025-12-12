import { Block, Grid } from '@jsxstyle/react'
import { AgenticInput, colors } from '@repro/design'
import { logger } from '@repro/logger'
import React, { useState } from 'react'

const PLACEHOLDER_COPY = [
  'What is causing this bug?',
  'Why are the network requests failing?',
  'Explain the console errors - and how do I fix them?',
]

export const Agentic: React.FC = () => {
  const [inputHasFocus, setInputHasFocus] = useState(false)

  return (
    <Grid gridTemplateRows="1fr auto" blockSize="100%">
      <Block
        marginInline={-20}
        marginBlockEnd={20}
        marginBlockStart={-20}
        backgroundColor={inputHasFocus ? colors.slate['50'] : 'transparent'}
        transition="all ease-in-out 100ms"
      />

      <Block
        marginInline={inputHasFocus ? -20 : 0}
        marginBlock={inputHasFocus ? -20 : 0}
        paddingInline={inputHasFocus ? 20 : 0}
        paddingBlock={inputHasFocus ? 20 : 0}
        backgroundColor={inputHasFocus ? 'transparent' : colors.slate['100']}
        boxShadow={inputHasFocus ? '0 -4px 8px rgba(0, 0, 0, 0.05)' : 'none'}
        borderBlockStart={inputHasFocus && `1px solid ${colors.slate['200']}`}
        borderRadius={inputHasFocus ? 0 : 8}
        transition="all ease-in-out 100ms"
      >
        <AgenticInput
          placeholders={PLACEHOLDER_COPY}
          onFocusChange={setInputHasFocus}
          onSubmit={logger.debug}
        />
      </Block>
    </Grid>
  )
}
