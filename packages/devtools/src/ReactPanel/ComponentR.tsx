import { Inline } from '@jsxstyle/react'
import { colors } from '@repro/design'
import { ReactComponentNode } from '@repro/domain'
import React, { PropsWithChildren } from 'react'
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

const Syntax: React.FC<PropsWithChildren> = ({ children }) => (
  <Inline color={colors.slate['500']}>{children}</Inline>
)

const ComponentName: React.FC<PropsWithChildren> = ({ children }) => (
  <Inline color={colors.violet['700']} fontWeight={500}>
    {children}
  </Inline>
)
