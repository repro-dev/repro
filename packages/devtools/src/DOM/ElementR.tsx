import { Inline } from '@jsxstyle/react'
import { color, fontSize } from '@repro/design'
import { VElement } from '@repro/domain'
import React, { Fragment } from 'react'
import { Container } from './Container'

interface Props {
  node: VElement
}

const Open: React.FC<Props> = ({ node }) => (
  <Container>
    <Syntax>{`<`}</Syntax>
    <TagName>{node.tagName}</TagName>
    {Object.entries(node.attributes).map(([name, value]) => (
      <Attribute key={name} name={name} value={value ?? undefined} />
    ))}
    <Syntax>{`>`}</Syntax>
  </Container>
)

const Close: React.FC<Props> = ({ node }) => (
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

const Syntax: React.FC<{ children?: React.ReactNode }> = ({ children }) => (
  <Inline color={color.text.muted}>{children}</Inline>
)

const TagName: React.FC<{ children?: React.ReactNode }> = ({ children }) => (
  <Inline color={color.danger}>{children}</Inline>
)

const Attribute: React.FC<{ name: string; value?: string }> = ({
  name,
  value,
}) => (
  <Inline marginLeft={fontSize.xs / 2}>
    <Inline color={color.warning}>{name}</Inline>

    {value && (
      <Fragment>
        <Syntax>{'="'}</Syntax>
        <Inline color={color.info}>{value}</Inline>
        <Syntax>{'"'}</Syntax>
      </Fragment>
    )}
  </Inline>
)
