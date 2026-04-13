import { Inline } from '@jsxstyle/react'
import { color, colors } from '@repro/design'
import { VElement } from '@repro/domain'
import React, { Fragment } from 'react'
import { FONT_SIZE } from './constants'
import { Container } from './Container'

interface Props {
  node: VElement
}

const Open: React.FC = ({ node }) => (
  <Container>
    <Syntax>{`<`}</Syntax>
    <TagName>{node.tagName}</TagName>
    {Object.entries(node.attributes).map(([name, value]) => (
      <Attribute key={name} name={name} value={value} />
    ))}
    <Syntax>{`>`}</Syntax>
  </Container>
)

const Close: React.FC = ({ node }) => (
  <Container>
    <Syntax>{`</`}</Syntax>
    <TagName>{node.tagName}</TagName>
    <Syntax>{`>`}</Syntax>
  </Container>
)

export const ElementR = {
  Open,
  Close,
}

const Syntax: React.FC = ({ children }) => (
  <Inline color={color.text.muted}>{children}</Inline>
)

const TagName: React.FC = ({ children }) => (
  <Inline color={colors.pink['700']}>{children}</Inline>
)

const Attribute: React.FC = ({ name, value }) => (
  <Inline marginLeft={FONT_SIZE / 2}>
    <Inline color={colors.amber['700']}>{name}</Inline>

    {value && (
      <Fragment>
        <Syntax>{'="'}</Syntax>
        <Inline color={colors.indigo['700']}>{value}</Inline>
        <Syntax>{'"'}</Syntax>
      </Fragment>
    )}
  </Inline>
)
