import {
  SYSTEM_CARD_MESSAGE,
  createAgenticState,
  makeAccessorFromEventList,
  type Context,
  type StreamProvider,
  type ToolDefinition,
} from '@repro/agentic'
import { AgenticStateContext, AgenticView } from '@repro/agentic-ui'
import { useApiClient } from '@repro/api-client'
import { isValidAttributeName } from '@repro/dom-utils'
import { toPng } from '@repro/dom-to-image'
import { NodeId, VTree } from '@repro/domain'
import { usePlayback } from '@repro/playback'
import {
  extractCSSEmbeddedURLs,
  isDocTypeVNode,
  isDocumentVNode,
  isElementVNode,
  isStyleElementVNode,
  isTextVNode,
} from '@repro/vdom-utils'
import { parse } from 'event-stream-parser'
import { attemptP, chain } from 'fluture'
import React, { useMemo } from 'react'

// Build a DOM tree from a VTree into the given document.
// resourceMap maps original resource URLs to local blob/data URLs.
// Returns the root Node (fragment or element) to append to the document.
function buildDOM(
  vtree: VTree,
  doc: Document,
  resourceMap: Record<string, string>
): Node {
  const HOVER_CLASS = '-repro-hover'

  function resolveURL(url: string): string {
    if (url.startsWith('#') || url.startsWith('data:')) {
      return url
    }
    return resourceMap[url] ?? url
  }

  function replaceURLsInCSS(cssText: string): string {
    const urls = extractCSSEmbeddedURLs(cssText)
    for (const url of urls) {
      const resolved = resolveURL(url)
      if (resolved !== url) {
        cssText = cssText.replace(url, resolved)
      }
    }
    return cssText
  }

  function createNode(
    nodeId: NodeId,
    svgContext: boolean,
    isUnderStyleRoot: boolean
  ): Node {
    const vNode = vtree.nodes[nodeId] ?? null

    if (!vNode) {
      return doc.createDocumentFragment()
    }

    if (isTextVNode(vNode)) {
      let value = vNode.map(v => v.value).orElse('')
      if (isUnderStyleRoot) {
        value = value.replace(':hover', `.${HOVER_CLASS}`)
        value = replaceURLsInCSS(value)
      }
      return doc.createTextNode(value)
    }

    if (isDocTypeVNode(vNode)) {
      return doc.createDocumentFragment()
    }

    if (isDocumentVNode(vNode)) {
      const fragment = doc.createDocumentFragment()
      vNode.apply(v => {
        for (const childId of v.children) {
          fragment.appendChild(createNode(childId, svgContext, isUnderStyleRoot))
        }
      })
      return fragment
    }

    if (isElementVNode(vNode)) {
      // Check for html root element — treat like document: produce a fragment
      const isHtmlRoot = vNode.match(v => v.tagName === 'html')
      if (isHtmlRoot) {
        const fragment = doc.createDocumentFragment()
        vNode.apply(v => {
          for (const childId of v.children) {
            fragment.appendChild(
              createNode(childId, svgContext, isUnderStyleRoot)
            )
          }
        })
        return fragment
      }

      let result: Node = doc.createDocumentFragment()

      vNode.apply(v => {
        const tagName = v.tagName

        // Skip nested iframes — just render a placeholder
        if (tagName === 'iframe') {
          result = doc.createElement('iframe')
          return
        }

        let ctx = svgContext
        if (tagName === 'svg') ctx = true

        const element = ctx
          ? doc.createElementNS('http://www.w3.org/2000/svg', tagName)
          : doc.createElement(tagName)

        if (tagName === 'foreignObject') ctx = false

        for (const [name, value] of Object.entries(v.attributes)) {
          if (!isValidAttributeName(name)) continue
          let attrValue = value
          if (attrValue !== null) {
            if (name === 'src') {
              attrValue = resolveURL(attrValue)
            } else if (name === 'href' && tagName === 'link') {
              attrValue = resolveURL(attrValue)
            } else if (name === 'style') {
              attrValue = replaceURLsInCSS(attrValue)
            }
          }
          element.setAttribute(name, attrValue ?? '')
        }

        const isStyleRoot = isStyleElementVNode(vNode)
        for (const childId of v.children) {
          element.appendChild(createNode(childId, ctx, isStyleRoot))
        }

        result = element
      })

      return result
    }

    return doc.createDocumentFragment()
  }

  return createNode(vtree.rootId, false, false)
}

export const Agentic: React.FC = () => {
  const apiClient = useApiClient()
  const playback = usePlayback()

  const streamProvider: StreamProvider = useMemo(
    () => (context: Context, toolDefs: ToolDefinition[], signal?: AbortSignal) => {
      const response = apiClient.fetch<ReadableStream>(
        '/agentic/response',
        {
          method: 'POST',
          body: JSON.stringify({
            messages: [
              { role: 'system', content: SYSTEM_CARD_MESSAGE },
              ...context,
            ],
            tools: toolDefs,
            tool_choice: 'auto',
          }),
          ...(signal != null ? { signal } : {}),
        },
        'json',
        'stream'
      )

      return response.pipe(chain(stream => attemptP(() => parse(stream))))
    },
    [apiClient]
  )

  const state = useMemo(
    () =>
      createAgenticState(streamProvider, {
        getDuration: () => playback.getDuration(),
        getSnapshotAtTime: (timestampMs: number) => {
          const pb = playback.copy()
          pb.seekToTime(timestampMs)
          return pb.getSnapshot()
        },
        captureScreenshot: async (timestampMs: number): Promise<string> => {
          const pb = playback.copy()
          pb.seekToTime(timestampMs)
          const snapshot = pb.getSnapshot()

          if (!snapshot.dom) {
            throw new Error('No DOM snapshot available at timestamp')
          }

          const iframe = document.createElement('iframe')
          iframe.width = '1280'
          iframe.height = '720'
          iframe.style.cssText =
            'position:fixed;top:-9999px;left:-9999px;border:0;visibility:hidden'
          document.body.appendChild(iframe)

          let wrapper: HTMLDivElement | null = null

          try {
            // Wait for iframe to be ready (no-src iframes load synchronously in Chrome,
            // but we guard with a promise in case the timing varies)
            if (!iframe.contentDocument) {
              await new Promise<void>(resolve => {
                iframe.onload = () => resolve()
              })
            }

            const iframeDoc = iframe.contentDocument!

            // Clear the document and build snapshot DOM into it
            while (iframeDoc.documentElement.firstChild) {
              iframeDoc.documentElement.firstChild.remove()
            }

            const domRoot = buildDOM(
              snapshot.dom,
              iframeDoc,
              playback.getResourceMap()
            )
            iframeDoc.documentElement.appendChild(domRoot)

            // Wait one animation frame for layout to settle
            await new Promise<void>(resolve =>
              requestAnimationFrame(() => resolve())
            )

            // Workaround for dom-to-image issue #201: wrap documentElement in a div
            // appended to the main document before calling toPng
            wrapper = document.createElement('div')
            wrapper.style.cssText =
              'position:fixed;top:-9999px;left:-9999px;width:1280px;height:720px;overflow:hidden'
            wrapper.appendChild(iframeDoc.documentElement.cloneNode(true))
            document.body.appendChild(wrapper)

            const dataUrl = await toPng(wrapper, { width: 1280, height: 720 })
            return dataUrl
          } finally {
            if (wrapper && wrapper.parentNode) {
              wrapper.parentNode.removeChild(wrapper)
            }
            if (iframe.parentNode) {
              iframe.parentNode.removeChild(iframe)
            }
          }
        },
        ...makeAccessorFromEventList(playback.getSourceEvents()),
      }),
    [streamProvider, playback]
  )

  return (
    <AgenticStateContext.Provider value={state}>
      <AgenticView />
    </AgenticStateContext.Provider>
  )
}
