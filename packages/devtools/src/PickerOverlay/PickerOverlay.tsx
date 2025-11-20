import { Block } from '@jsxstyle/react'
import { colors } from '@repro/design'
import { isIFrameElement } from '@repro/dom-utils'
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

function getTargetElementAtPoint(
  boundingBox: DOMRect,
  doc: Document | null,
  x: number,
  y: number
) {
  if (!doc) {
    return null
  }

  const scalingFactor = doc.documentElement.clientWidth / boundingBox.width

  let targetElement = doc.elementsFromPoint(
    scalingFactor * (x - boundingBox.left),
    scalingFactor * (y - boundingBox.top)
  )[0]

  while (targetElement && isIFrameElement(targetElement)) {
    const doc = targetElement.contentDocument
    const offsetX = targetElement.offsetLeft
    const offsetY = targetElement.offsetTop

    if (doc) {
      targetElement = doc.elementsFromPoint(
        scalingFactor * (x - offsetX - boundingBox.left),
        scalingFactor * (y - offsetY - boundingBox.top)
      )[0]
    }
  }

  return targetElement || null
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
  const ref = useRef() as MutableRefObject<HTMLDivElement>

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
      const elem$ = fromEvent<PointerEvent>(ref.current, 'pointermove', {
        capture: true,
        passive: true,
      }).pipe(
        map(evt => {
          return getTargetElementAtPoint(
            ref.current.getBoundingClientRect(),
            currentDocument,
            evt.clientX,
            evt.clientY
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
        fromEvent<PointerEvent>(ref.current, 'pointerdown')
          .pipe(
            map(evt => {
              const target = getTargetElementAtPoint(
                ref.current.getBoundingClientRect(),
                currentDocument,
                evt.clientX,
                evt.clientY
              )

              return target ? target.getAttribute('data-repro-node') : null
            })
          )
          .subscribe(nodeId => {
            setSelectedNode(nodeId)
            setTargetElement(null)
            setFocusedNode(null)
            setPicker(false)

            if (nodeId !== null) {
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
              stroke={colors.pink['500']}
              strokeDasharray="5 5"
              strokeWidth={1}
            />
            <line
              x1={boundingBox.x + boundingBox.width}
              x2={boundingBox.x + boundingBox.width}
              y1={0}
              y2="100%"
              stroke={colors.pink['500']}
              strokeDasharray="5 5"
              strokeWidth={1}
            />
            <line
              x1={0}
              x2="100%"
              y1={boundingBox.y}
              y2={boundingBox.y}
              stroke={colors.pink['500']}
              strokeDasharray="5 5"
              strokeWidth={1}
            />
            <line
              x1={0}
              x2="100%"
              y1={boundingBox.y + boundingBox.height}
              y2={boundingBox.y + boundingBox.height}
              stroke={colors.pink['500']}
              strokeDasharray="5 5"
              strokeWidth={1}
            />
            <rect
              x={boundingBox.x}
              y={boundingBox.y}
              width={boundingBox.width}
              height={boundingBox.height}
              fill={colors.pink['500']}
              fillOpacity={0.2}
              stroke={colors.pink['500']}
              strokeWidth={2}
            />
          </g>
        )}
      </svg>
    </Block>
  )
})
