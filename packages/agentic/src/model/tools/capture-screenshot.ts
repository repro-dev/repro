import { attemptP, chain, resolve, type FutureInstance } from 'fluture'
import { RecordingDataAccessor } from '../../types'
import { estimateTokens } from '../token-optimization'
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

export const handler: ToolHandler = (
  recording: RecordingDataAccessor,
  args
) => {
  const timestampMs = (args.timestampMs as number) ?? 0

  return recording.getSnapshotAtTime(timestampMs).pipe(
    chain((snapshot): FutureInstance<unknown, Record<string, unknown>> => {
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
      const [viewportWidth, viewportHeight] = snapshot.interaction
        ?.viewport ?? [1280, 720]

      return recording.getResourceMap().pipe(
        chain(resourceMap => {
          return attemptP(async () => {
            // Dynamic imports keep browser-only packages out of the module graph at
            // initialization time so this file is safe to import in Node.js test envs.
            const { captureDocument, createOffscreenDocument } = await import(
              '@repro/dom-to-image'
            )
            const { clearDocument, createDOMFromVTree, patchDocumentElement } =
              await import('@repro/vdom-renderer')

            const { doc, cleanup } = await createOffscreenDocument(
              viewportWidth,
              viewportHeight
            )

            try {
              clearDocument(doc)

              const [rootNode, nodeMap] = createDOMFromVTree({
                vtree,
                doc,
                rootNodeMap: {},
                currentPageURL: pageURL,
                resourceBaseURL: '',
                resourceMap,
                isUnderStyleRoot: false,
              })

              patchDocumentElement(vtree, nodeMap, doc.documentElement)

              if (rootNode !== null) {
                doc.documentElement.appendChild(rootNode)
              }

              const dataUrl = await captureDocument(doc, {
                width: viewportWidth,
                height: viewportHeight,
              })

              const result = { timestampMs, dataUrl }
              return {
                ...result,
                _tokenEstimate: estimateTokens(result),
              }
            } finally {
              cleanup()
            }
          })
        })
      )
    })
  )
}
