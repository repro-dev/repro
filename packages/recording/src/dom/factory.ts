import {
  isDocTypeNode,
  isDocumentNode,
  isElementNode,
  isInlineEventAttribute,
  isInputElement,
  isSelectElement,
  isTextAreaElement,
  isTextNode,
} from '@repro/dom-utils'
import {
  NodeType,
  SyntheticId,
  VDocType,
  VDocument,
  VElement,
  VNode,
  VShadowRoot,
  VText,
  VTree,
} from '@repro/domain'
import { Box } from '@repro/tdl'
import { createSyntheticId, getNodeId } from '@repro/vdom-utils'
import { redactStringPreservingWhitespace } from '../redaction'
import { isMaskedBySelector } from './utils'

type MaskedSelectorOptions = {
  maskedSelectors?: Array<string>
}

type VElementOptions = MaskedSelectorOptions & {
  attributeOverrides?: Record<string, string>
}

export function createVNode(
  node: Node,
  options: MaskedSelectorOptions = {}
): VNode | null {
  if (isDocumentNode(node)) {
    return new Box(createVDocument(node))
  }

  if (isDocTypeNode(node)) {
    return new Box(createVDocType(node))
  }

  if (node instanceof ShadowRoot) {
    return new Box(createVShadowRoot(node))
  }

  if (isElementNode(node)) {
    return new Box(createVElement(node, options))
  }

  if (isTextNode(node)) {
    return new Box(createVText(node, options))
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
  options: VElementOptions = {}
): VElement {
  const { attributeOverrides, maskedSelectors = [] } = options
  const attributes =
    attributeOverrides ??
    Array.from(element.attributes)
      .filter(({ name }) => !isInlineEventAttribute(name))
      .reduce((attrs, { name, value }) => ({ ...attrs, [name]: value }), {})

  const isMasked = isMaskedBySelector(element, maskedSelectors)

  if (isMasked && 'value' in attributes) {
    attributes.value = redactStringPreservingWhitespace(
      String(attributes.value ?? '')
    )
  }

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
    properties.value = isMasked
      ? redactStringPreservingWhitespace(element.value)
      : element.type === 'password'
      ? redactStringPreservingWhitespace(element.value)
      : element.value

    if ('value' in attributes) {
      attributes.value = properties.value
    }
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

export function createVText(
  text: Text,
  options: MaskedSelectorOptions = {}
): VText {
  const { maskedSelectors = [] } = options

  return {
    id: getNodeId(text),
    parentId: text.parentNode ? getNodeId(text.parentNode) : null,
    type: NodeType.Text,
    value: isMaskedBySelector(text, maskedSelectors)
      ? redactStringPreservingWhitespace(text.data)
      : text.data,
  }
}

export function createVShadowRoot(shadowRoot: ShadowRoot): VShadowRoot {
  const children: Array<SyntheticId> = []
  const sheets =
    shadowRoot.adoptedStyleSheets && shadowRoot.adoptedStyleSheets.length
      ? Array.from(shadowRoot.adoptedStyleSheets)
      : []
  const adoptedStyleSheets: Array<string> = sheets.map(sheet => {
    try {
      return Array.from(sheet.cssRules)
        .map(r => r.cssText)
        .join('\n')
    } catch {
      return ''
    }
  })

  return {
    id: getNodeId(shadowRoot),
    hostId: getNodeId(shadowRoot.host),
    type: NodeType.ShadowRoot,
    children,
    mode: shadowRoot.mode,
    adoptedStyleSheets,
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
