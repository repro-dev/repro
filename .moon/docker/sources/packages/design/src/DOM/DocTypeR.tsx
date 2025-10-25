import { VDocType } from '@repro/domain'
import { Inline } from '@jsxstyle/react'
import React from 'react'
import { colors } from '../theme'
import { Container } from './Container'

interface Props {
  node: VDocType
}

export const DocTypeR: React.FC<Props> = ({ node }) => (
  <Container>
    <Inline color={colors.slate['500']}>{`<!DOCTYPE ${node.name}${
      node.publicId && `PUBLIC ${node.publicId}`
    }${node.systemId}>`}</Inline>
  </Container>
)
