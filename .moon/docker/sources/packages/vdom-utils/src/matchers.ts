import {
  NodeType,
  VDocType,
  VDocument,
  VElement,
  VNode,
  VText,
} from '@repro/domain'
import { Box } from '@repro/tdl'
import { Immutable } from '@repro/ts-utils'

export function isDocumentVNode(
  node: VNode | Immutable<VNode>
): node is Box<VDocument> | Immutable<Box<VDocument>> {
  return node.match(node => node.type === NodeType.Document)
}

export function isDocTypeVNode(
  node: VNode | Immutable<VNode>
): node is Box<VDocType> | Immutable<Box<VDocType>> {
  return node.match(node => node.type === NodeType.DocType)
}

export function isElementVNode(
  node: VNode | Immutable<VNode>
): node is Box<VElement> | Immutable<Box<VElement>> {
  return node.match(node => node.type === NodeType.Element)
}

export function isParentVNode(
  node: VNode | Immutable<VNode>
): node is Box<VDocument | VElement> | Immutable<Box<VDocument | VElement>> {
  return isElementVNode(node) || isDocumentVNode(node)
}

// https://developer.mozilla.org/en-US/docs/Glossary/Empty_element
const EMPTY_ELEMENT_NAMES = [
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'keygen',
  'link',
  'meta',
  'param',
  'source',
  'track',
  'wbr',
]

export function isEmptyElementVNode(node: VNode | Immutable<VNode>) {
  return (
    isElementVNode(node) &&
    node.match(node => EMPTY_ELEMENT_NAMES.includes(node.tagName))
  )
}

export function isStyleElementVNode(node: VNode | Immutable<VNode>) {
  return isElementVNode(node) && node.match(node => node.tagName === 'style')
}

export function isTextVNode(node: VNode): node is Box<VText> {
  return node.match(node => node.type === NodeType.Text)
}
