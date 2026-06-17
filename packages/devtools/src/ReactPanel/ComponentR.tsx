import { Inline } from '@jsxstyle/react'
import { color, fontWeight } from '@repro/design'
import { ReactComponentNode } from '@repro/domain'
import React from 'react'
import { Container } from '../DOM/Container'

interface Props {
  node: ReactComponentNode
}

const Open: React.FC<Props> = ({ node }) => (
  <Container>
    <Syntax>{'<'}</Syntax>
    <ComponentName>{node.componentName}</ComponentName>
    <Syntax>{'>'}</Syntax>
  </Container>
)

const Close: React.FC<Props> = ({ node }) => (
  <Container>
    <Syntax>{'</'}</Syntax>
    <ComponentName>{node.componentName}</ComponentName>
    <Syntax>{'>'}</Syntax>
  </Container>
)

export const ComponentR = {
  Open,
  Close,
}

const Syntax: React.FC<{ children?: React.ReactNode }> = ({ children }) => (
  <Inline color={color.text.muted}>{children}</Inline>
)

const ComponentName: React.FC<{ children?: React.ReactNode }> = ({
  children,
}) => (
  <Inline color={color.primary} fontWeight={fontWeight.semibold}>
    {children}
  </Inline>
)
