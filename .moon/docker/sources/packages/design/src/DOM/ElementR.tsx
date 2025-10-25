import { VElement } from '@repro/domain'
import { Inline } from '@jsxstyle/react'
import React, { Fragment, PropsWithChildren } from 'react'
import { colors } from '../theme'
import { FONT_SIZE } from './constants'
import { Container } from './Container'

interface Props {
  node: VElement
}

const Open: React.FC<Props> = ({ node }) => (
  <Container>
    <Syntax>{`<`}</Syntax>
    <TagName>{node.tagName}</TagName>
    {Object.entries(node.attributes).map(([name, value]) => (
      <Attribute key={name} name={name} value={value} />
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

const Syntax: React.FC<PropsWithChildren> = ({ children }) => (
  <Inline color={colors.slate['500']}>{children}</Inline>
)

const TagName: React.FC<PropsWithChildren> = ({ children }) => (
  <Inline color={colors.pink['700']}>{children}</Inline>
)

const Attribute: React.FC<{ name: string; value: string | null }> = ({
  name,
  value,
}) => (
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
