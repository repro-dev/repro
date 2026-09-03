import { Block } from '@jsxstyle/react'
import React, { Fragment } from 'react'
import { color } from '../tokens/colors'
import { spacing } from '../tokens/spacing'
import { fontSize, fontWeight, lineHeight } from '../tokens/typography'

interface Props {
  title: string
  pairs: Array<[string, React.ReactNode]>
}

/**
 * Titled group of key-value pairs rendered as grid rows.
 *
 * Use for structured data display (metadata, configuration, properties).
 * Must be placed inside a CSS Grid parent with at least two columns —
 * the component uses `gridColumn: "1 / span 2"` for the title row.
 */
export const DefinitionList: React.FC<Props> = ({ title, pairs }) => (
  <Fragment>
    <Block
      gridColumn="1 / span 2"
      paddingTop={spacing['3xl']}
      paddingBottom={spacing.md}
      paddingH={spacing.md}
      fontSize={fontSize.sm}
      fontWeight={fontWeight.bold}
      color={color.primary}
      borderBottom={`1px solid ${color.border.default}`}
    >
      {title}
    </Block>

    {pairs.map(([key, value]) => (
      <Fragment key={key}>
        <Block
          padding={spacing.md}
          fontWeight={fontWeight.bold}
          lineHeight={lineHeight.normal}
          color={color.text.secondary}
          borderBottom={`1px solid ${color.border.default}`}
        >
          {key}
        </Block>
        <Block
          padding={spacing.md}
          borderBottom={`1px solid ${color.border.default}`}
          // Relaxed leading: values carry unbounded-length text (>50 chars in
          // practice) and need readable line height (REP-1656 tight-leading).
          lineHeight={lineHeight.relaxed}
          wordBreak="break-word"
        >
          {value}
        </Block>
      </Fragment>
    ))}
  </Fragment>
)
