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

      // Local stylesheets may contain style rules as text nodes, but these will
      // already have been processed from sheet.cssRules.
      // TODO: lift this condition/exclusion into the DOM visitor
      if (isLocalStylesheet(node)) {
        continue
      }

      if (isIFrameElement(node) && node.contentDocument) {
        queue.push(node.contentDocument)
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

  return walk
}

export function isIgnoredByNode(node: Node, ignoredNodes: Array<Node> = []) {
  return ignoredNodes.some(ignoredNode => {
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
