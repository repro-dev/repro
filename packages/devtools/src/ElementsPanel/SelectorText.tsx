import { Inline } from '@jsxstyle/react'
import { getTokenColor, tokenizeSelector } from '@repro/css-utils'
import React from 'react'

interface SelectorTextProps {
  text: string
}

function renderTokenValue(token: {
  type: string
  value: string
  args?: string
}): string {
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

        if (color) {
          return (
            <Inline key={i} color={color}>
              {displayValue}
            </Inline>
          )
        }

        // Tokens without color (whitespace, comma, unknown) render as plain text
        return <React.Fragment key={i}>{displayValue}</React.Fragment>
      })}
    </>
  )
}

SelectorText.displayName = 'SelectorText'
