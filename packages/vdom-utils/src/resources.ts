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

// Matches @import "url" or @import 'url' or @import url(...) — captures the URL
const MATCH_CSS_IMPORT_PATTERN =
  /@import\s+(?:url\(['"]?([^'")\s]+)['"]?\)|['"]([^'"]+)['"])/g

export function extractCSSEmbeddedURLs(line: string) {
  return [...line.matchAll(MATCH_URL_PATTERN)].map(
    match => match[1]
  ) as Array<string>
}

export function extractCSSImportURLs(cssText: string): Array<string> {
  const urls: Array<string> = []

  for (const match of cssText.matchAll(MATCH_CSS_IMPORT_PATTERN)) {
    // group 1 = url(...) form, group 2 = quoted string form
    const url = match[1] ?? match[2]

    if (url) {
      urls.push(url)
    }
  }

  return urls
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

      // SVG <use> elements may reference external sprite sheets via href or
      // xlink:href. Pure hash refs (e.g. "#symbol") are inline references and
      // do not require a network resource, but anything with a URL before the
      // hash (e.g. "icons.svg#arrow") must be captured. Strip the fragment and
      // record only the base URL.
      if (node.tagName === 'use') {
        const hrefAttr =
          node.attributes['href'] ?? node.attributes['xlink:href']

        if (hrefAttr && !hrefAttr.startsWith('#')) {
          // Remove the hash fragment before adding to the resource map
          const hashIndex = hrefAttr.indexOf('#')
          const baseURL =
            hashIndex !== -1 ? hrefAttr.slice(0, hashIndex) : hrefAttr

          if (baseURL) {
            addResource(baseURL)
          }
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

        // Also capture URLs from @import directives — these are not caught
        // by the url() pattern above since @import "url" uses bare strings.
        const importURLs = extractCSSImportURLs(node.value)

        for (const url of importURLs) {
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

              // Capture url() references in dynamic inline style mutations
              if (attributeName === 'style') {
                const urls = extractCSSEmbeddedURLs(attributeValue)

                for (const url of urls) {
                  if (!isDataURI(url)) {
                    addResource(url)
                  }
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
