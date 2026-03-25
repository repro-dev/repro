import { Stats } from '@repro/diagnostics'
import { isElementNode } from '@repro/dom-utils'
import {
  InteractionEvent,
  InteractionType,
  Point,
  SourceEvent,
  SourceEventType,
  SourceEventView,
} from '@repro/domain'
import { interpolatePointFromSample } from '@repro/source-utils'
import { List } from '@repro/tdl'
import {
  applyDOMPatchEvent,
  clearDocument,
  createDOMFromVTree,
  HOVER_CLASS,
  HOVER_SELECTOR,
  MutableNodeMap,
  patchDocumentElement,
  updateAllScrollStates,
  updateScroll,
} from '@repro/vdom-renderer'
import React, { useEffect, useMemo } from 'react'
import { Observable, Subscription, asapScheduler, from } from 'rxjs'
import {
  distinctUntilChanged,
  filter,
  map,
  observeOn,
  switchMap,
} from 'rxjs/operators'
import { OUT_OF_BOUNDS_POINT } from '../constants'
import { usePlayback } from '../hooks'
import { ControlFrame } from '../types'

function isNotIdle(controlFrame: ControlFrame) {
  return controlFrame !== ControlFrame.Idle
}

interface Props {
  ownerDocument: Document | null
  trackScroll: boolean
  resourceBaseURL?: string
  onLoad?: (nodeMap: MutableNodeMap) => void
}

export const NativeDOMRenderer: React.FC<Props> = ({
  ownerDocument,
  resourceBaseURL,
  trackScroll,
  onLoad,
}) => {
  const playback = usePlayback()

  const resourceMap = playback.getResourceMap()
  const invertedResourceMap = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(resourceMap).map(([key, value]) => [value, key])
      ),
    [resourceMap]
  )

  useEffect(() => {
    let nodeMap: MutableNodeMap = {}

    const subscription = new Subscription()

    subscription.add(
      playback.$latestControlFrame
        .pipe(filter(isNotIdle), observeOn(asapScheduler))
        .subscribe(() => {
          Stats.time('NativeDOMRenderer (effect): render from snapshot', () => {
            const snapshot = playback.getSnapshot()
            const pointer = snapshot.interaction?.pointer || OUT_OF_BOUNDS_POINT
            const scrollMap = snapshot.interaction?.scroll || {}
            const pageURL = snapshot.interaction?.pageURL ?? ''

            nodeMap = {}

            if (ownerDocument) {
              if (snapshot.dom) {
                const vtree = snapshot.dom
                const isUnderStyleRoot = false

                const [rootNode, vtreeNodeMap] = Stats.time(
                  'NativeDOMRenderer (effect): create DOM from VTree',
                  () => {
                    return createDOMFromVTree(
                      vtree,
                      ownerDocument,
                      nodeMap,
                      pageURL,
                      resourceBaseURL || '',
                      invertedResourceMap,
                      isUnderStyleRoot
                    )
                  }
                )

                Stats.time('NativeDOMRenderer (effect): clear document', () => {
                  clearDocument(ownerDocument)
                })

                const documentElement = ownerDocument.documentElement

                Stats.time(
                  'NativeDOMRenderer (effect): patch document element',
                  () => {
                    patchDocumentElement(vtree, vtreeNodeMap, documentElement)
                  }
                )

                if (rootNode) {
                  documentElement.appendChild(rootNode)
                  nodeMap = vtreeNodeMap

                  if (onLoad) {
                    onLoad(nodeMap)
                  }

                  if (trackScroll) {
                    Stats.time(
                      'NativeDOMRenderer (effect): update all scroll states',
                      () => {
                        updateAllScrollStates(nodeMap, scrollMap)
                      }
                    )
                  }

                  Stats.time(
                    'NativeDOMRenderer (effect): update hover targets',
                    () => {
                      updateHoverTargets(ownerDocument, pointer)
                    }
                  )
                }
              }
            }
          })
        })
    )

    subscription.add(
      playback.$snapshot
        .pipe(
          observeOn(asapScheduler),
          map(snapshot => snapshot.interaction?.pointer || OUT_OF_BOUNDS_POINT),
          distinctUntilChanged()
        )
        .subscribe(pointer => {
          if (ownerDocument) {
            // TODO: schedule this on idle callback
            updateHoverTargets(ownerDocument, pointer)
          }
        })
    )

    subscription.add(
      playback.$buffer
        .pipe(
          switchMap<List<SourceEventView>, Observable<SourceEvent>>(buffer =>
            from(buffer)
          )
        )
        .subscribe(event => {
          event.apply(event => {
            switch (event.type) {
              case SourceEventType.DOMPatch:
                const snapshot = playback.getSnapshot()
                const pageURL = snapshot.interaction?.pageURL ?? ''
                if (ownerDocument) {
                  applyDOMPatchEvent(
                    event,
                    ownerDocument,
                    nodeMap,
                    pageURL,
                    resourceBaseURL || '',
                    invertedResourceMap
                  )
                }
                break

              case SourceEventType.Interaction:
                applyInteractionEvent(
                  event,
                  nodeMap,
                  playback.getElapsed(),
                  trackScroll
                )
                break
            }
          })
        })
    )

    return () => {
      subscription.unsubscribe()

      if (ownerDocument) {
        clearDocument(ownerDocument)
      }
    }
  }, [ownerDocument, playback, onLoad])

  return null
}

function updateHoverTargets(doc: Document, pointer: Point) {
  const existingHoverTargets = doc.querySelectorAll(HOVER_SELECTOR)
  const hoverTargets = doc.elementsFromPoint(...pointer)

  for (const element of Array.from(existingHoverTargets)) {
    element.classList.remove(HOVER_CLASS)
  }

  for (const element of hoverTargets) {
    element.classList.add(HOVER_CLASS)
  }
}

function applyInteractionEvent(
  event: InteractionEvent,
  nodeMap: MutableNodeMap,
  elapsed: number,
  trackScroll: boolean
) {
  event.data.apply(data => {
    if (trackScroll && data.type === InteractionType.Scroll) {
      const target = data.target
      const node = nodeMap[target]

      if (node && isElementNode(node)) {
        const [left, top] = interpolatePointFromSample(
          data,
          event.time,
          elapsed
        )

        updateScroll(node, left, top)
      }
    }
  })
}
