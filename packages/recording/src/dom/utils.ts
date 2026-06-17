import { VTree } from '@repro/domain'

import {
  isDocTypeNode,
  isDocumentFragmentNode,
  isDocumentNode,
  isElementNode,
  isIFrameElement,
  isLocalStylesheet,
  isScriptElement,
  isTextNode,
} from '@repro/dom-utils'

import { DOMOptions, Visitor } from '../types'

function walkDOMTree(
  root: Node,
  domVisitor: Visitor<VTree>,
  passiveVisitors: Array<Visitor<any>>,
  options: DOMOptions
) {
  const visitors = [domVisitor, ...passiveVisitors]
  const queue = [root]

  let node: Node | undefined

  while ((node = queue.shift())) {
    if (isIgnoredByNode(node, options.ignoredNodes)) {
      continue
    }

    if (isIgnoredBySelector(node, options.ignoredSelectors)) {
      continue
    }

    if (isElementNode(node)) {
      if (isScriptElement(node)) {
        // TODO: insert synthetic node to show script elements in inspector
        continue
      }

      for (const visitor of visitors) {
        visitor.elementNode(node)
      }

      // When the sheet is accessible, rules are captured from sheet.cssRules
      // via createStyleSheetVTree; skip child traversal to avoid duplicates.
      // When the sheet is null (not yet parsed, cross-origin, or constructed),
      // fall back to capturing the raw text content from child text nodes.
      if (isLocalStylesheet(node) && node.sheet) {
        continue
      }

      if (isIFrameElement(node) && node.contentDocument) {
        queue.push(node.contentDocument)
      }

      // Traverse into open shadow roots
      if (node.shadowRoot && node.shadowRoot.mode !== 'closed') {
        queue.push(node.shadowRoot)
      }
    } else if (node instanceof ShadowRoot) {
      for (const visitor of visitors) {
        visitor.shadowRootNode(node)
      }
    } else if (isTextNode(node)) {
      for (const visitor of visitors) {
        visitor.textNode(node)
      }
    } else if (isDocumentFragmentNode(node)) {
      for (const visitor of visitors) {
        visitor.documentFragmentNode(node)
      }
    } else if (isDocumentNode(node)) {
      for (const visitor of visitors) {
        visitor.documentNode(node)
      }
    } else if (isDocTypeNode(node)) {
      for (const visitor of visitors) {
        visitor.documentTypeNode(node)
      }
    }

    queue.push(...Array.from(node.childNodes))
  }

  for (const visitor of passiveVisitors) {
    visitor.done()
  }

  return domVisitor.done()
}

export interface DOMTreeWalker {
  (root: Node): VTree | null
  walkDOMOnly(root: Node): VTree | null
  accept(visitor: Visitor<any>): void
  acceptDOMVisitor(visitor: Visitor<VTree>): void
}

export function createDOMTreeWalker(options: DOMOptions): DOMTreeWalker {
  let domVisitor: Visitor<VTree> | null = null
  const passiveVisitors: Array<Visitor<any>> = []

  const walk = (root: Node) => {
    if (!domVisitor) {
      throw new Error('DOMTreeWalker: missing DOM visitor')
    }

    return walkDOMTree(root, domVisitor, passiveVisitors, options)
  }

  walk.acceptDOMVisitor = (visitor: Visitor<VTree>) => {
    domVisitor = visitor
  }

  walk.accept = (visitor: Visitor<any>) => {
    passiveVisitors.push(visitor)
  }

  walk.walkDOMOnly = (root: Node) => {
    if (!domVisitor) {
      throw new Error('DOMTreeWalker: missing DOM visitor')
    }
    return walkDOMTree(root, domVisitor, [], options)
  }

  return walk
}

export function isIgnoredByNode(node: Node, ignoredNodes: Array<Node> = []) {
  return ignoredNodes.some(ignoredNode => {
    // `Node.contains()` does not pierce shadow boundaries.
    // For a ShadowRoot, check whether its host element is contained.
    if (node instanceof ShadowRoot) {
      return ignoredNode === node || ignoredNode.contains(node.host)
    }
    // For a node inside a shadow root, traverse the shadow boundary
    // to find the host element and check if the host is ignored.
    const root = node.getRootNode()
    if (root instanceof ShadowRoot) {
      if (ignoredNode === root || ignoredNode.contains(root.host)) {
        return true
      }
    }
    return ignoredNode.contains(node)
  })
}

export function isIgnoredBySelector(
  node: Node,
  ignoredSelectors: Array<string> = []
) {
  if (isElementNode(node)) {
    return ignoredSelectors.some(selector => {
      return node.matches(selector)
    })
  }

  return false
}

export function isMaskedBySelector(
  node: Node,
  maskedSelectors: Array<string> = []
) {
  if (isElementNode(node)) {
    return maskedSelectors.some(selector => {
      return node.closest(selector) !== null
    })
  }

  if (isTextNode(node)) {
    return maskedSelectors.some(selector => {
      return node.parentElement?.closest(selector) != null
    })
  }

  return false
}
