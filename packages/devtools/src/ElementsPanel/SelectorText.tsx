import { Inline } from '@jsxstyle/react'
import type { SelectorToken } from '@repro/css-utils'
import { getTokenColor, tokenizeSelector } from '@repro/css-utils'
import React from 'react'

interface SelectorTextProps {
  text: string
}

function renderTokenValue(token: SelectorToken): string {
  if (token.args !== undefined) {
    return `${token.value}(${token.args})`
  }
  return token.value
}

export const SelectorText: React.FC<SelectorTextProps> = ({ text }) => {
  const tokens = tokenizeSelector(text)

  if (tokens.length === 0) {
    return null
  }

  return (
    <>
      {tokens.map((token, i) => {
        const color = getTokenColor(token.type)
        const displayValue = renderTokenValue(token)
        const key = `${token.type}-${token.value}-${i}`

        if (color) {
          return (
            <Inline key={key} color={color}>
              {displayValue}
            </Inline>
          )
        }

        // Tokens without color (whitespace, comma, unknown) render as plain text
        return <React.Fragment key={key}>{displayValue}</React.Fragment>
      })}
    </>
  )
}
