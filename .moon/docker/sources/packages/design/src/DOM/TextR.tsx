import { VText } from '@repro/domain'
import { Inline } from '@jsxstyle/react'
import React from 'react'
import { colors } from '../theme'
import { Container } from './Container'

interface Props {
  node: VText
}

export const TextR: React.FC<Props> = ({ node }) => (
  <Container>
    <Inline color={colors.slate['700']}>{node.value}</Inline>
  </Container>
)
