import {
  isDocTypeNode,
  isDocumentNode,
  isElementNode,
  isInlineEventAttribute,
  isInputElement,
  isSelectElement,
  isTextAreaElement,
  isTextNode,
  maskValue,
} from '@repro/dom-utils'
import {
  NodeType,
  SyntheticId,
  VDocType,
  VDocument,
  VElement,
  VNode,
  VText,
  VTree,
} from '@repro/domain'
import { Box } from '@repro/tdl'
import { createSyntheticId, getNodeId } from '@repro/vdom-utils'

export function createVNode(node: Node): VNode | null {
  if (isDocumentNode(node)) {
    return new Box(createVDocument(node))
  }

  if (isDocTypeNode(node)) {
    return new Box(createVDocType(node))
  }

  if (isElementNode(node)) {
    return new Box(createVElement(node))
  }

  if (isTextNode(node)) {
    return new Box(createVText(node))
  }

  return null
}

export function createVDocument(doc: Document): VDocument {
  return {
    id: getNodeId(doc),
    parentId: doc.parentNode ? getNodeId(doc.parentNode) : null,
    type: NodeType.Document,
    children: [],
  }
}

export function createVDocType(doctype: DocumentType): VDocType {
  return {
    id: getNodeId(doctype),
    parentId: doctype.parentNode ? getNodeId(doctype.parentNode) : null,
    type: NodeType.DocType,
    name: doctype.name,
    publicId: doctype.publicId,
    systemId: doctype.systemId,
  }
}

export function createVElement(
  element: Element,
  attributeOverrides?: Record<string, string>
): VElement {
  const attributes =
    attributeOverrides ??
    Array.from(element.attributes)
      .filter(({ name }) => !isInlineEventAttribute(name))
      .reduce((attrs, { name, value }) => ({ ...attrs, [name]: value }), {})

  const properties: VElement['properties'] = {
    checked: null,
    value: null,
    selectedIndex: null,
  }

  if (
    isInputElement(element) ||
    isTextAreaElement(element) ||
    isSelectElement(element)
  ) {
    properties.value =
      element.type === 'password' ? maskValue(element.value) : element.value
  }

  if (
    isInputElement(element) &&
    (element.type === 'checkbox' || element.type === 'radio')
  ) {
    properties.checked = element.checked
  }

  if (isSelectElement(element)) {
    properties.selectedIndex = element.selectedIndex
  }

  // TODO: check if element is shadow root

  return {
    id: getNodeId(element),
    parentId: element.parentNode ? getNodeId(element.parentNode) : null,
    type: NodeType.Element,
    tagName: element.nodeName.toLowerCase(),
    attributes,
    properties,
    children: [],
    shadowRoot: element.shadowRoot != null,
  }
}

export function createVText(text: Text): VText {
  return {
    id: getNodeId(text),
    parentId: text.parentNode ? getNodeId(text.parentNode) : null,
    type: NodeType.Text,
    value: text.data,
  }
}

export function createStyleSheetVTree(
  node: HTMLStyleElement | HTMLLinkElement
): VTree | null {
  if (!node.sheet) {
    return null
  }

  const rootId = getNodeId(node)
  const parentId = node.parentNode ? getNodeId(node.parentNode) : null
  const children: Array<SyntheticId> = []

  const vTree: VTree = {
    rootId,
    nodes: {},
  }

  for (const rule of Array.from(node.sheet.cssRules)) {
    const childId = createSyntheticId()

    vTree.nodes[childId] = new Box({
      id: childId,
      parentId: rootId,
      type: NodeType.Text,
      value: rule.cssText,
    })

    children.push(childId)
  }

  const attributes: Record<string, string | null> = {}

  if (node.hasAttribute('media')) {
    attributes.media = node.getAttribute('media')
  }

  vTree.nodes[rootId] = new Box({
    id: rootId,
    parentId,
    type: NodeType.Element,
    tagName: 'style',
    attributes,
    properties: {
      checked: null,
      selectedIndex: null,
      value: null,
    },
    children,
    shadowRoot: node.shadowRoot != null,
  })

  return vTree
}
