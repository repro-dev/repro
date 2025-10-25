import { DocTypeR, DocumentR, ElementR, TextR } from '@repro/design'
import { VNode } from '@repro/domain'
import {
  isDocTypeVNode,
  isDocumentVNode,
  isElementVNode,
  isTextVNode,
} from '@repro/vdom-utils'
import React from 'react'

interface Props {
  node: VNode
}

export const VNodeRenderer: React.FC<Props> = ({ node }) => {
  if (isDocTypeVNode(node)) {
    return node.map(node => <DocTypeR node={node} />).orElse(null)
  }

  if (isDocumentVNode(node)) {
    return <DocumentR />
  }

  if (isElementVNode(node)) {
    return node.map(node => <ElementR.Open node={node} />).orElse(null)
  }

  if (isTextVNode(node)) {
    return node.map(node => <TextR node={node} />).orElse(null)
  }

  return null
}
