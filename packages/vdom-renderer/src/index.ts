import {
  isBodyElement,
  isElementNode,
  isHTMLElement,
  isLocalStylesheet,
  isTextNode,
  isValidAttributeName,
} from '@repro/dom-utils'
import {
  DOMPatchEvent,
  PatchType,
  ScrollMap,
  SyntheticId,
  VTree,
} from '@repro/domain'
import { logger } from '@repro/logger'
import {
  extractCSSEmbeddedURLs,
  isDocTypeVNode,
  isDocumentVNode,
  isElementVNode,
  isParentVNode,
  isStyleElementVNode,
  isTextVNode,
} from '@repro/vdom-utils'

export type MutableNodeMap = Record<SyntheticId, Node>

export const HOVER_CLASS = '-repro-hover'
export const HOVER_SELECTOR = `.${HOVER_CLASS}`

export function clearDocument(doc: Document) {
  while (doc.documentElement.firstChild) {
    doc.documentElement.firstChild.remove()
  }

  updateScroll(doc.documentElement, 0, 0)
}

export function updateAllScrollStates(
  nodeMap: MutableNodeMap,
  scrollMap: ScrollMap
) {
  for (const [nodeId, [x, y]] of Object.entries(scrollMap)) {
    const node = nodeMap[nodeId]

    if (node) {
      updateScroll(node, x, y)
    }
  }
}

export function updateScroll(node: Node, x: number, y: number) {
  if (node && isElementNode(node)) {
    let element = node

    if (isBodyElement(element)) {
      element = element.ownerDocument.documentElement
    }

    // Override CSS `scroll-behavior` if set
    if (isHTMLElement(element)) {
      element.style.scrollBehavior = 'auto'
    }

    element.scrollTo(x, y)

    // Revert CSS `scroll-behavior`
    if (isHTMLElement(element)) {
      element.style.scrollBehavior = ''
    }
  }
}

export function applyDOMPatchEvent(
  event: DOMPatchEvent,
  doc: Document,
  nodeMap: MutableNodeMap,
  currentPageURL: string,
  resourceBaseURL: string,
  resourceMap: Record<string, string>
) {
  event.data.apply(data => {
    outer: {
      switch (data.type) {
        case PatchType.Text: {
          const targetId = data.targetId
          const node = nodeMap[targetId]

          if (node && isTextNode(node)) {
            node.textContent = data.value
          }

          break
        }

        case PatchType.Attribute: {
          const targetId = data.targetId
          const node = nodeMap[targetId]

          if (node && isElementNode(node)) {
            if (isValidAttributeName(data.name)) {
              let value = data.value

              if (value !== null) {
                if (data.name === 'src') {
                  value = resolveURLToResource(
                    value,
                    currentPageURL,
                    resourceBaseURL,
                    resourceMap
                  )
                } else if (data.name === 'srcset') {
                  value = replaceURLsInSrcset(
                    value,
                    currentPageURL,
                    resourceBaseURL,
                    resourceMap
                  )
                } else if (data.name === 'style') {
                  value = replaceURLsInCSSText(
                    value,
                    currentPageURL,
                    resourceBaseURL,
                    resourceMap
                  )
                }
              }

              node.setAttribute(data.name, value ?? '')
            }
          }

          break
        }

        case PatchType.BooleanProperty:
        case PatchType.NumberProperty:
        case PatchType.TextProperty: {
          const targetId = data.targetId
          const node = nodeMap[targetId]

          if (node && isElementNode(node)) {
            // TODO: ensure property is valid for target element

            if (
              Object.getPrototypeOf(node).hasOwnProperty(
                `__original__${data.name}`
              )
            ) {
              // @ts-ignore
              node[`__original__${data.name}`] = data.value
              // @ts-ignore
            } else {
              // @ts-ignore
              node[data.name] = data.value
            }
          }

          break
        }

        case PatchType.AddNodes: {
          const parentId = data.parentId
          const previousSiblingId = data.previousSiblingId
          const nextSiblingId = data.nextSiblingId

          const parent = nodeMap[parentId]
          const parentIsStyleRoot =
            parent != null && isElementNode(parent) && isLocalStylesheet(parent)

          for (const vtree of data.nodes) {
            if (nodeMap.hasOwnProperty(vtree.rootId)) {
              break outer
            }
          }

          if (parent) {
            const [fragment, newNodeMap] = data.nodes
              .map(vtree =>
                createDOMFromVTree({
                  vtree,
                  doc,
                  rootNodeMap: nodeMap,
                  currentPageURL,
                  resourceBaseURL,
                  resourceMap,
                  isUnderStyleRoot: parentIsStyleRoot,
                })
              )
              .reduce(
                ([fragment, nodeMap], [node, nextNodeMap]) => {
                  if (fragment && node) {
                    fragment.appendChild(node)
                    Object.assign(nodeMap, nextNodeMap)
                  }

                  return [fragment, nodeMap]
                },
                [doc.createDocumentFragment(), {}]
              )

            if (!fragment) {
              break
            }

            const prev =
              previousSiblingId !== null
                ? nodeMap[previousSiblingId] ?? null
                : null

            const next =
              nextSiblingId !== null ? nodeMap[nextSiblingId] ?? null : null

            let didMount = false

            if (prev && prev.parentNode) {
              if (prev.parentNode === parent) {
                if (prev.nextSibling) {
                  parent.insertBefore(fragment, prev.nextSibling)
                  didMount = true
                } else {
                  parent.appendChild(fragment)
                  didMount = true
                }
              }
            } else if (next && next.parentNode) {
              if (next.parentNode === parent) {
                parent.insertBefore(fragment, next)
                didMount = true
              }
            } else {
              parent.appendChild(fragment)
              didMount = true
            }

            if (didMount) {
              Object.assign(nodeMap, newNodeMap)
            }
          }

          break
        }

        case PatchType.RemoveNodes: {
          const rootNodeIds = data.nodes.map(vtree => vtree.rootId)
          const nodeIds = data.nodes.flatMap(vtree => Object.keys(vtree.nodes))

          for (const nodeId of rootNodeIds) {
            const node = nodeMap[nodeId]
            const parent = node?.parentNode || null

            if (node && parent) {
              parent.removeChild(node)
            }
          }

          for (const nodeId of nodeIds) {
            delete nodeMap[nodeId]
          }

          break
        }
      }
    }
  })
}

export function createDOMFromVTree({
  vtree,
  doc,
  rootNodeMap,
  currentPageURL,
  resourceBaseURL,
  resourceMap,
  isUnderStyleRoot,
}: {
  vtree: VTree
  doc: Document
  rootNodeMap: MutableNodeMap
  currentPageURL: string
  resourceBaseURL: string
  resourceMap: Record<string, string>
  isUnderStyleRoot: boolean
}): [Node | null, MutableNodeMap] {
  const nodeMap: MutableNodeMap = {}

  const createNode = (
    nodeId: SyntheticId,
    parentId: SyntheticId | null,
    svgContext: boolean = false
  ): Node => {
    const vNode = vtree.nodes[nodeId] || null

    const parentVNode = (parentId && vtree.nodes[parentId]) || null

    if (rootNodeMap.hasOwnProperty(nodeId)) {
      logger.warn(
        `render: Duplicate node(${nodeId}) of parent(${parentId})`,
        rootNodeMap[nodeId],
        vNode?.orElse(null),
        parentVNode?.orElse(null),
        vtree
      )

      // TODO: investigate why web component slots have duplicate renders
      return doc.createDocumentFragment()
    }

    let node: Node = document.createDocumentFragment()

    if (!vNode) {
      logger.error(`render: Could not find VNode(${nodeId})`, {
        nodeId,
        parentId,
        parentVNode: parentVNode?.orElse(null),
        vtree,
      })

      return node
    }

    if (isTextVNode(vNode)) {
      let value = vNode.map(vNode => vNode.value).orElse('')

      // CSS hover states cannot be triggered programmatically.
      // Replace hover pseudo-selectors with class selector.
      if (
        isUnderStyleRoot ||
        (parentVNode && isStyleElementVNode(parentVNode))
      ) {
        value = value.replace(':hover', HOVER_SELECTOR)
        value = replaceURLsInCSSText(
          value,
          currentPageURL,
          resourceBaseURL,
          resourceMap
        )
      }

      node = doc.createTextNode(value)
    } else if (isDocTypeVNode(vNode)) {
      node = doc.createDocumentFragment()
    } else if (
      isDocumentVNode(vNode) ||
      (isElementVNode(vNode) && vNode.match(vNode => vNode.tagName === 'html'))
    ) {
      const fragment = doc.createDocumentFragment()

      vNode.apply(vNode => {
        for (const childId of vNode.children) {
          fragment.appendChild(createNode(childId, nodeId, svgContext))
        }
      })

      node = fragment
    } else {
      if (isElementVNode(vNode)) {
        vNode.apply(vNode => {
          if (vNode.tagName === 'iframe') {
            const frame = doc.createElement('iframe')

            for (const [name, value] of Object.entries(vNode.attributes)) {
              if (isValidAttributeName(name) && name !== 'src') {
                frame.setAttribute(name, value ?? '')
              }
            }

            const fragment = doc.createDocumentFragment()

            for (const childId of vNode.children) {
              fragment.appendChild(createNode(childId, nodeId, svgContext))
            }

            frame.addEventListener(
              'load',
              () => {
                const doc = frame.contentDocument

                if (doc) {
                  doc.open()
                  doc.write('<!doctype html>')
                  doc.close()

                  const root = doc.createElement('html')
                  doc.documentElement.remove()
                  doc.appendChild(root)
                  root.appendChild(fragment)
                }
              },
              { once: true }
            )

            node = frame
          } else {
            if (vNode.tagName === 'svg') {
              svgContext = true
            }

            let tagName = vNode.tagName

            const element = svgContext
              ? doc.createElementNS('http://www.w3.org/2000/svg', tagName)
              : doc.createElement(tagName)

            if (vNode.tagName === 'foreignObject') {
              svgContext = false
            }

            for (let [name, value] of Object.entries(vNode.attributes)) {
              if (isValidAttributeName(name)) {
                if (value !== null) {
                  if (name === 'src') {
                    value = resolveURLToResource(
                      value,
                      currentPageURL,
                      resourceBaseURL,
                      resourceMap
                    )
                  } else if (name === 'srcset') {
                    value = replaceURLsInSrcset(
                      value,
                      currentPageURL,
                      resourceBaseURL,
                      resourceMap
                    )
                  } else if (name === 'style') {
                    value = replaceURLsInCSSText(
                      value,
                      currentPageURL,
                      resourceBaseURL,
                      resourceMap
                    )
                  } else if (name === 'href' && vNode.tagName === 'link') {
                    value = resolveURLToResource(
                      value,
                      currentPageURL,
                      resourceBaseURL,
                      resourceMap
                    )
                  } else if (
                    (name === 'href' || name === 'xlink:href') &&
                    vNode.tagName === 'use' &&
                    !value.startsWith('#')
                  ) {
                    // Resolve the base URL of external SVG sprite hrefs.
                    // The resource map stores the base file URL (hash stripped);
                    // reconstruct the full href with the original fragment intact.
                    const hashIndex = value.indexOf('#')
                    const baseURL =
                      hashIndex !== -1 ? value.slice(0, hashIndex) : value
                    const fragment =
                      hashIndex !== -1 ? value.slice(hashIndex) : ''
                    value =
                      resolveURLToResource(
                        baseURL,
                        currentPageURL,
                        resourceBaseURL,
                        resourceMap
                      ) + fragment
                  }
                }

                element.setAttribute(name, value ?? '')
              }
            }

            queueMicrotask(() => {
              for (const [name, value] of Object.entries(vNode.properties)) {
                // TODO: ensure property is valid for target element

                if (
                  Object.getPrototypeOf(element).hasOwnProperty(
                    `__original__${name}`
                  )
                ) {
                  // @ts-ignore
                  element[`__original__${name}`] = value
                } else {
                  // @ts-ignore
                  element[name] = value
                }
              }
            })

            for (const childId of vNode.children) {
              element.appendChild(createNode(childId, nodeId, svgContext))
            }

            node = element
          }
        })
      }
    }

    if (isElementNode(node)) {
      node.setAttribute('data-repro-node', nodeId)
    }

    nodeMap[nodeId] = node

    return node
  }

  return [createNode(vtree.rootId, null, false), nodeMap]
}

export function replaceURLsInSrcset(
  srcset: string,
  currentPageURL: string,
  resourceBaseURL: string,
  resourceMap: Record<string, string>
) {
  return srcset
    .split(',')
    .map(source => source.trim().split(/\s+/) as [string, string | undefined])
    .map(([url, condition]) =>
      [
        resolveURLToResource(url, currentPageURL, resourceBaseURL, resourceMap),
        condition,
      ].join(' ')
    )
    .join(',')
}

export function replaceURLsInCSSText(
  cssText: string,
  currentPageURL: string,
  resourceBaseURL: string,
  resourceMap: Record<string, string>
) {
  const urls = extractCSSEmbeddedURLs(cssText).map(
    url =>
      [
        url,
        resolveURLToResource(url, currentPageURL, resourceBaseURL, resourceMap),
      ] as const
  )

  for (const [url, resourceURL] of urls) {
    if (url !== resourceURL) {
      cssText = cssText.replace(url, resourceURL)
    }
  }

  return cssText
}

export function resolveURLToResource(
  url: string,
  currentPageURL: string,
  resourceBaseURL: string,
  resourceMap: Record<string, string>
) {
  // Do not attempt to resolve hash URLs
  if (url.startsWith('#')) {
    return url
  }

  try {
    // If the url is relative and we do not have access to the base URL,
    // `new URL` will throw. In this case, we just fall back to the URL
    // contained in the source event.
    const absoluteURL = new URL(url, currentPageURL || undefined).href
    const resourceId = resourceMap[absoluteURL]
    return resourceId ? `${resourceBaseURL}${resourceId}` : absoluteURL
  } catch {
    return url
  }
}

export function patchDocumentElement(
  vtree: VTree,
  nodeMap: MutableNodeMap,
  documentElement: HTMLElement
) {
  const queue = [vtree.rootId]

  let nodeId: SyntheticId | undefined
  while ((nodeId = queue.shift())) {
    const vNode = vtree.nodes[nodeId]

    if (!vNode) {
      throw new Error(
        `PlaybackCanvas/NativeDOMRenderer: could not find VNode: ${nodeId}`
      )
    }

    if (
      isElementVNode(vNode) &&
      vNode.match(vNode => vNode.tagName === 'html')
    ) {
      nodeMap[nodeId] = documentElement

      vNode.apply(vNode => {
        for (const [name, value] of Object.entries(vNode.attributes)) {
          if (isValidAttributeName(name)) {
            documentElement.setAttribute(name, value ?? '')
          }
        }
      })

      break
    }

    if (isParentVNode(vNode)) {
      vNode.apply(vNode => {
        queue.push(...vNode.children)
      })
    }
  }
}
