import { Inline } from '@jsxstyle/react'
import { color } from '@repro/design'
import { VText } from '@repro/domain'
import React from 'react'
import { Container } from './Container'

interface Props {
  node: VText
}

export const TextR: React.FC<Props> = ({ node }) => (
  <Container>
    <Inline color={color.text.secondary}>{node.value}</Inline>
  </Container>
)
