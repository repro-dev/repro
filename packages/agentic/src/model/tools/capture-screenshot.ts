import { captureDocument } from '@repro/dom-to-image'
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
  const [viewportWidth, viewportHeight] = snapshot.interaction?.viewport ?? [1280, 720]
  const resourceMap = recording.getResourceMap()

  return attemptP(async () => {
    const iframe = document.createElement('iframe')
    iframe.width = String(viewportWidth)
    iframe.height = String(viewportHeight)
    iframe.style.cssText =
      'position:fixed;top:-9999px;left:-9999px;border:0;visibility:hidden'
    document.body.appendChild(iframe)

    try {
      // No-src iframes load synchronously in Chrome, but guard with a promise
      // in case timing varies across environments.
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

      const dataUrl = await captureDocument(iframeDoc, {
        width: viewportWidth,
        height: viewportHeight,
      })

      const result = { timestampMs, dataUrl }
      return { ...result, _tokenEstimate: estimateTokens(result) }
    } finally {
      if (iframe.parentNode) {
        iframe.parentNode.removeChild(iframe)
      }
    }
  })
}
