import { Inline } from '@jsxstyle/react'
import { color } from '@repro/design'
import { VDocType } from '@repro/domain'
import React from 'react'
import { Container } from './Container'

interface Props {
  node: VDocType
}

export const DocTypeR: React.FC<Props> = ({ node }) => (
  <Container>
    <Inline color={color.text.muted}>{`<!DOCTYPE ${node.name}${
      node.publicId && `PUBLIC ${node.publicId}`
    }${node.systemId}>`}</Inline>
  </Container>
)
