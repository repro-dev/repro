import { Block } from '@jsxstyle/react'
import React, { Fragment } from 'react'
import { colors } from '../theme'

interface Props {
  title: string
  pairs: Array<[string, React.ReactNode]>
}

export const DefinitionList: React.FC<Props> = ({ title, pairs }) => (
  <Fragment>
    <Block
      gridColumn="1 / span 2"
      paddingTop={30}
      paddingBottom={10}
      paddingH={10}
      fontSize={15}
      fontWeight={700}
      color={colors.blue['700']}
      borderBottom={`1px solid ${colors.slate['200']}`}
    >
      {title}
    </Block>

    {pairs.map(([key, value]) => (
      <Fragment key={key}>
        <Block
          padding={10}
          fontWeight={700}
          lineHeight={1.25}
          color={colors.slate['700']}
          borderBottom={`1px solid ${colors.slate['200']}`}
        >
          {key}
        </Block>
        <Block
          padding={10}
          borderBottom={`1px solid ${colors.slate['200']}`}
          lineHeight={1.25}
          wordBreak="break-word"
        >
          {value}
        </Block>
      </Fragment>
    ))}
  </Fragment>
)
