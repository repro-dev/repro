import { DOMOptions } from '../types'
import { createDOMTreeWalker } from './utils'
import { createDOMVisitor } from './visitor'

export function html2VTree(
  html: string,
  options: DOMOptions = { ignoredNodes: [], ignoredSelectors: [] }
) {
  const parser = new DOMParser()
  const doc = parser.parseFromString(html, 'text/html')
  const walkDOMTree = createDOMTreeWalker(options)
  walkDOMTree.acceptDOMVisitor(createDOMVisitor())
  return walkDOMTree(doc as unknown as Node)
}
