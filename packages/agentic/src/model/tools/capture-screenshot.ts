import { toPng } from '@repro/dom-to-image'
import {
  clearDocument,
  createDOMFromVTree,
  patchDocumentElement,
} from '@repro/vdom-renderer'
import { attemptP, resolve } from 'fluture'
import { estimateTokens } from '../token-optimization'
import { RecordingDataAccessor } from '../../types'
import { createError, ToolHandler } from './common'

export const TOOL_DEFINITION = {
  type: 'function',
  function: {
    name: 'captureScreenshot',
    description:
      'Capture a screenshot of the recording at a specific timestamp. Returns a base64 PNG data URL that can be embedded in a Linear issue description or comment.',
    parameters: {
      type: 'object',
      properties: {
        timestampMs: {
          type: 'number',
          description:
            'Timestamp in milliseconds from the start of the recording.',
        },
      },
      required: ['timestampMs'],
    },
  },
}

export const handler: ToolHandler = (recording: RecordingDataAccessor, args) => {
  const timestampMs = (args.timestampMs as number) ?? 0

  const snapshot = recording.getSnapshotAtTime(timestampMs)

  if (!snapshot || !snapshot.dom) {
    return resolve({
      ...createError(
        'No DOM snapshot available at this timestamp',
        'The recording may not have a snapshot at the requested time',
        'Call getRecordingDuration() to check the valid range, then retry with a timestamp within bounds'
      ),
      _tokenEstimate: estimateTokens({ error: true }),
    })
  }

  const vtree = snapshot.dom
  const pageURL = snapshot.interaction?.pageURL ?? ''
  const resourceMap = recording.getResourceMap()

  return attemptP(async () => {
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

      clearDocument(iframeDoc)

      const [rootNode, nodeMap] = createDOMFromVTree(
        vtree,
        iframeDoc,
        {},
        pageURL,
        '',
        resourceMap,
        false
      )

      patchDocumentElement(vtree, nodeMap, iframeDoc.documentElement)

      if (rootNode !== null) {
        iframeDoc.documentElement.appendChild(rootNode)
      }

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

      const result = { timestampMs, dataUrl }
      return { ...result, _tokenEstimate: estimateTokens(result) }
    } finally {
      if (wrapper && wrapper.parentNode) {
        wrapper.parentNode.removeChild(wrapper)
      }
      if (iframe.parentNode) {
        iframe.parentNode.removeChild(iframe)
      }
    }
  })
}
