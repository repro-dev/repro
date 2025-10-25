import {
  InteractionType,
  PatchType,
  SourceEvent,
  SourceEventType,
} from '@repro/domain'
import { randomString } from '@repro/random-string'
import { createVTreeWalker } from './createVTreeWalker'
import { isElementVNode } from './matchers'

const MATCH_URL_PATTERN = /url\(['"]?((?:\S*?\(\S*?\))*\S*?)['"]?\)/g

export function extractCSSEmbeddedURLs(line: string) {
  return [...line.matchAll(MATCH_URL_PATTERN)].map(
    match => match[1]
  ) as Array<string>
}

function isDataURI(uri: string) {
  return uri.startsWith('data:')
}

export function createResourceMap(events: Array<SourceEvent>) {
  const visitedURLs = new Set<string>()
  const resourceMap: Record<string, string> = {}
  const walkVTree = createVTreeWalker()

  let currentPageURL = ''

  function addResource(url: string) {
    try {
      // FIXME: Handle in-page hash resources (i.e. SVG definitions)
      const absoluteURL = new URL(url, currentPageURL || undefined).href

      if (!visitedURLs.has(absoluteURL)) {
        const resourceId = randomString(4)
        resourceMap[resourceId] = absoluteURL
        visitedURLs.add(absoluteURL)
      }
    } catch (error) {
      console.error(`Unable to add resource to map: ${url}`, error)
    }
  }

  function parseSrcset(srcset: string) {
    const urls: Array<string> = []

    for (let part of srcset.split(',')) {
      part = part.trim()
      const [url] = part.split(/\s+/) as [string]
      urls.push(url)
    }

    return urls
  }

  walkVTree.accept({
    elementNode(node, vtree) {
      if (node.attributes.style) {
        const urls = extractCSSEmbeddedURLs(node.attributes.style)

        for (const url of urls) {
          if (isDataURI(url)) {
            continue
          }

          addResource(url)
        }
      }

      if (node.tagName === 'img' || node.tagName === 'source') {
        if (node.tagName === 'source') {
          const parent = node.parentId ? vtree.nodes[node.parentId] : null
          const isPictureSource =
            parent &&
            isElementVNode(parent) &&
            parent.match(parent => parent.tagName === 'picture')

          if (!isPictureSource) {
            return
          }
        }

        if (node.attributes.src) {
          addResource(node.attributes.src)
        }

        if (node.attributes.srcset) {
          const urls = parseSrcset(node.attributes.srcset)

          for (const url of urls) {
            addResource(url)
          }
        }
      }

      if (node.tagName === 'link' && node.attributes.rel === 'stylesheet') {
        if (node.attributes.href) {
          addResource(node.attributes.href)
        }
      }
    },

    textNode(node, vtree) {
      const parent = node.parentId ? vtree.nodes[node.parentId] : null

      if (
        parent &&
        isElementVNode(parent) &&
        parent.match(parent => parent.tagName === 'style')
      ) {
        const urls = extractCSSEmbeddedURLs(node.value)

        for (const url of urls) {
          addResource(url)
        }
      }
    },

    // Not implemented
    documentNode() {},
    docTypeNode() {},
  })

  // Get initial page URL
  // TODO: this should be on the leading snapshot
  for (const event of events) {
    let willBreak = false

    event.apply(event => {
      if (event.type === SourceEventType.Interaction) {
        event.data.apply(data => {
          if (data.type === InteractionType.PageTransition) {
            currentPageURL = data.to
            willBreak = true
          }
        })
      }
    })

    if (willBreak) {
      break
    }
  }

  const firstEvent = events[0]

  // Walk leading snapshot
  if (firstEvent) {
    firstEvent.apply(firstEvent => {
      if (firstEvent.type === SourceEventType.Snapshot) {
        if (firstEvent.data.dom) {
          walkVTree(firstEvent.data.dom)
        }
      }
    })
  }

  for (const event of events) {
    event.apply(event => {
      if (event.type === SourceEventType.Interaction) {
        event.data.apply(data => {
          if (data.type === InteractionType.PageTransition) {
            currentPageURL = data.to
          }
        })
      }

      if (event.type === SourceEventType.DOMPatch) {
        event.data.apply(data => {
          if (data.type === PatchType.Attribute) {
            const attributeName = data.name
            const attributeValue = data.value

            if (attributeValue !== null) {
              if (attributeName === 'src') {
                addResource(attributeValue)
              }

              if (attributeName === 'srcset') {
                const urls = parseSrcset(attributeValue)

                for (const url of urls) {
                  addResource(url)
                }
              }
            }
          }
        })
      }
    })
  }

  return resourceMap
}

export function filterResourceMap(
  resourceMap: Record<string, string>,
  resourceIds: Array<string>
): Record<string, string> {
  return resourceIds.reduce(
    (filteredResourceMap, resourceId) => {
      const resource = resourceMap[resourceId]

      if (resource) {
        filteredResourceMap[resourceId] = resource
      }

      return filteredResourceMap
    },
    {} as Record<string, string>
  )
}
