import { Block } from '@jsxstyle/react'
import { color } from '@repro/design'
import { isIFrameElement, isInert } from '@repro/dom-utils'
import React, { MutableRefObject, useEffect, useRef, useState } from 'react'
import { Subscription, fromEvent } from 'rxjs'
import { distinctUntilChanged, map, share } from 'rxjs/operators'
import { MAX_INT32 } from '../constants'
import {
  useCurrentDocument,
  useDevToolsView,
  useElementPicker,
  useFocusedNode,
  useInspecting,
  useSelectedNode,
} from '../hooks'
import { View } from '../types'

function pick(candidates: Element[], topDoc: Document): Element | null {
  for (const candidate of candidates) {
    if (isIFrameElement(candidate)) {
      if (!isInert(candidate)) {
        return candidate
      }
      if (candidate.ownerDocument === topDoc) {
        return candidate
      }
      continue
    }
    if (!isInert(candidate)) {
      return candidate
    }
  }
  return null
}

export function getTargetElementAtPoint(
  boundingBox: DOMRect,
  doc: Document | null,
  x: number,
  y: number
): Element | null {
  if (!doc) {
    return null
  }

  const scalingFactor = doc.documentElement.clientWidth / boundingBox.width

  let targetElement = pick(
    doc.elementsFromPoint(
      scalingFactor * (x - boundingBox.left),
      scalingFactor * (y - boundingBox.top)
    ),
    doc
  )

  while (targetElement && isIFrameElement(targetElement)) {
    const iframeDoc = targetElement.contentDocument
    if (!iframeDoc) {
      break
    }
    const offsetX = targetElement.offsetLeft
    const offsetY = targetElement.offsetTop
    targetElement = pick(
      iframeDoc.elementsFromPoint(
        scalingFactor * (x - offsetX - boundingBox.left),
        scalingFactor * (y - offsetY - boundingBox.top)
      ),
      doc
    )
  }

  return targetElement ?? null
}

export const PickerOverlay: React.FC = React.memo(() => {
  const [picker, setPicker] = useElementPicker()
  const [currentDocument] = useCurrentDocument()
  const [focusedNode, setFocusedNode] = useFocusedNode()
  const [, setSelectedNode] = useSelectedNode()
  const [, setView] = useDevToolsView()
  const [, setInspecting] = useInspecting()
  const [targetElement, setTargetElement] = useState<Element | null>(null)
  const [boundingBox, setBoundingBox] = useState<DOMRect | null>(null)
  const ref = useRef<HTMLDivElement>(null) as MutableRefObject<HTMLDivElement>

  useEffect(() => {
    setTargetElement(
      focusedNode && currentDocument
        ? currentDocument.querySelector(`[data-repro-node="${focusedNode}"]`)
        : null
    )
  }, [focusedNode, setTargetElement])

  useEffect(() => {
    setBoundingBox(targetElement ? targetElement.getBoundingClientRect() : null)
  }, [targetElement, setBoundingBox])

  useEffect(() => {
    const subscription = new Subscription()

    if (picker) {
      const elem$ = fromEvent(ref.current, 'pointermove', {
        capture: true,
        passive: true,
      }).pipe(
        map(evt => {
          const pe = evt as PointerEvent
          return getTargetElementAtPoint(
            ref.current.getBoundingClientRect(),
            currentDocument,
            pe.clientX,
            pe.clientY
          )
        }),
        distinctUntilChanged(),
        share()
      )

      /**
       * TODO: investigate performance regression
       * - Likely requires optimisation of ElementTree (native renderer?)
       *
      subscription.add(
        elem$.subscribe(target => {
          setFocusedNode(target ? target.getAttribute('data-repro-node') : null)
        })
      )
      /**/

      subscription.add(elem$.subscribe(target => setTargetElement(target)))

      subscription.add(
        fromEvent(ref.current, 'pointerdown')
          .pipe(
            map(evt => {
              const pe = evt as PointerEvent
              const target = getTargetElementAtPoint(
                ref.current.getBoundingClientRect(),
                currentDocument,
                pe.clientX,
                pe.clientY
              )

              return target ? target.getAttribute('data-repro-node') : null
            })
          )
          .subscribe(nodeId => {
            setSelectedNode(nodeId)
            setTargetElement(null)
            setFocusedNode(null)

            if (nodeId !== null) {
              setPicker(false)
              setView(View.Elements)
              setInspecting(true)
            }
          })
      )
    }

    return () => {
      subscription.unsubscribe()
    }
  }, [
    currentDocument,
    ref,
    setBoundingBox,
    setFocusedNode,
    picker,
    setPicker,
    setView,
  ])

  return (
    <Block
      position="absolute"
      top={0}
      bottom={0}
      left={0}
      right={0}
      zIndex={MAX_INT32}
      pointerEvents={picker ? 'all' : 'none'}
      props={{ ref }}
    >
      <svg width="100%" height="100%">
        {boundingBox && (
          <g>
            <line
              x1={boundingBox.x}
              x2={boundingBox.x}
              y1={0}
              y2="100%"
              stroke={color.dangerBorder}
              strokeDasharray="5 5"
              strokeWidth={1}
            />
            <line
              x1={boundingBox.x + boundingBox.width}
              x2={boundingBox.x + boundingBox.width}
              y1={0}
              y2="100%"
              stroke={color.dangerBorder}
              strokeDasharray="5 5"
              strokeWidth={1}
            />
            <line
              x1={0}
              x2="100%"
              y1={boundingBox.y}
              y2={boundingBox.y}
              stroke={color.dangerBorder}
              strokeDasharray="5 5"
              strokeWidth={1}
            />
            <line
              x1={0}
              x2="100%"
              y1={boundingBox.y + boundingBox.height}
              y2={boundingBox.y + boundingBox.height}
              stroke={color.dangerBorder}
              strokeDasharray="5 5"
              strokeWidth={1}
            />
            <rect
              x={boundingBox.x}
              y={boundingBox.y}
              width={boundingBox.width}
              height={boundingBox.height}
              fill={color.dangerBorder}
              fillOpacity={0.2}
              stroke={color.dangerBorder}
              strokeWidth={2}
            />
          </g>
        )}
      </svg>
    </Block>
  )
})
