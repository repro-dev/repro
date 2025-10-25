import {
  isElementNode,
  isInputElement,
  isSelectElement,
  isTextAreaElement,
} from '@repro/dom-utils'
import { Interaction, InteractionType, Point } from '@repro/domain'
import { ObserverLike, createEventObserver } from '@repro/observer-utils'
import { Box } from '@repro/tdl'
import { getNodeId } from '@repro/vdom-utils'
import { createVElement } from '../dom/factory'
import { isIgnoredByNode, isIgnoredBySelector } from '../dom/utils'
import { RecordingOptions } from '../types'
import { sampleEventsByKey } from './sample'

type Callback = (interaction: Interaction, transposition?: number) => void

function identity<T>(value: T) {
  return value
}

export function createInteractionObserver(
  options: RecordingOptions,
  callback: Callback
): ObserverLike<Document> {
  const viewportResizeObserver = createViewportResizeObserver(
    callback,
    options.eventSampling.resize
  )
  const scrollObserver = createScrollObserver(
    callback,
    options.eventSampling.scroll
  )
  const pointerMoveObserver = createPointerMoveObserver(
    callback,
    options.eventSampling.pointerMove
  )
  const pointerDownObserver = createPointerDownObserver(callback)
  const pointerUpObserver = createPointerUpObserver(callback)
  const clickObserver = createClickObserver(callback, options)
  const doubleClickObserver = createDoubleClickObserver(callback, options)
  const keyDownObserver = createKeyDownObserver(callback)
  const keyUpObserver = createKeyUpObserver(callback)
  const pageTransitionObserver = createPageTransitionObserver(callback)

  return {
    disconnect() {
      viewportResizeObserver.disconnect()
      scrollObserver.disconnect()
      pointerMoveObserver.disconnect()
      pointerDownObserver.disconnect()
      pointerUpObserver.disconnect()
      clickObserver.disconnect()
      doubleClickObserver.disconnect()
      keyDownObserver.disconnect()
      keyUpObserver.disconnect()
      pageTransitionObserver.disconnect()
    },

    observe(doc, vtree) {
      viewportResizeObserver.observe(doc, vtree)
      scrollObserver.observe(doc, vtree)
      pointerMoveObserver.observe(doc, vtree)
      pointerDownObserver.observe(doc, vtree)
      pointerUpObserver.observe(doc, vtree)
      clickObserver.observe(doc, vtree)
      doubleClickObserver.observe(doc, vtree)
      keyDownObserver.observe(doc, vtree)
      keyUpObserver.observe(doc, vtree)
      pageTransitionObserver.observe(doc, vtree)
    },
  }
}

function createViewportResizeObserver(
  callback: Callback,
  sampling: number
): ObserverLike<Document> {
  let prevWidth = 0
  let prevHeight = 0

  const handleViewportResize = sampleEventsByKey<UIEvent, Point>(
    () => 'viewport-resize',
    ev => {
      const win = ev.currentTarget as Window
      return [win.innerWidth, win.innerHeight] as Point
    },
    (value, duration) => {
      callback(
        new Box({
          type: InteractionType.ViewportResize,
          from: [prevWidth, prevHeight],
          to: value,
          duration,
        }),
        duration
      )

      prevWidth = value[0]
      prevHeight = value[1]
    },
    sampling
  )

  const viewportResizeObserver = createEventObserver(
    'resize',
    handleViewportResize
  )

  return {
    disconnect: () => viewportResizeObserver.disconnect(),
    observe(doc, vtree) {
      const win = doc.defaultView

      // Only capture viewport size for root window
      if (win && win === win.top) {
        prevWidth = win.innerWidth
        prevHeight = win.innerHeight
        viewportResizeObserver.observe(win, vtree)
      }
    },
  }
}

function createScrollObserver(
  callback: Callback,
  sampling: number
): ObserverLike {
  const prevScrollMap = new WeakMap<EventTarget, Point>()

  const handleScroll = sampleEventsByKey<Event, Event>(
    (ev: Event) => getNodeId(ev.target as Node),
    identity,
    (ev, duration) => {
      const eventTarget = ev.target as Node

      let target: Element | null

      if ('scrollingElement' in eventTarget) {
        target = (eventTarget as Document).scrollingElement
      } else if ('documentElement' in eventTarget) {
        target = (eventTarget as Document).documentElement
      } else {
        target = eventTarget as Element
      }

      if (!target) {
        return
      }

      const prevScroll = prevScrollMap.get(target) || [0, 0]
      const nextScroll = [target.scrollLeft, target.scrollTop] as Point

      prevScrollMap.set(target, nextScroll)

      callback(
        new Box({
          type: InteractionType.Scroll,
          target: getNodeId(target),
          from: prevScroll,
          to: [target.scrollLeft, target.scrollTop] as Point,
          duration,
        }),
        duration
      )
    },
    sampling
  )

  return createEventObserver('scroll', handleScroll)
}

function createPointerMoveObserver(
  callback: Callback,
  sampling: number
): ObserverLike {
  let prevX: number | null = null
  let prevY: number | null = null

  const handlePointerMove = sampleEventsByKey(
    () => 'pointermove',
    (evt: PointerEvent) => {
      let offsetX = 0
      let offsetY = 0

      const eventTarget = evt.target

      if (eventTarget && isElementNode(eventTarget as Node)) {
        const ownerDocument = (eventTarget as Element).ownerDocument
        const defaultView = ownerDocument.defaultView
        const frameElement = defaultView ? defaultView.frameElement : null

        if (frameElement) {
          const { x, y } = frameElement.getBoundingClientRect()
          offsetX = x
          offsetY = y
        }
      }

      return [evt.clientX + offsetX, evt.clientY + offsetY] as Point
    },
    (value, duration) => {
      const [x, y] = value

      callback(
        new Box({
          type: InteractionType.PointerMove,
          from: [prevX ?? x, prevY ?? y],
          to: value,
          duration,
        }),
        duration
      )

      prevX = x
      prevY = y
    },
    sampling
  )

  return createEventObserver('pointermove', handlePointerMove)
}

function createPointerDownObserver(callback: Callback): ObserverLike<Document> {
  return createEventObserver('pointerdown', evt => {
    const target = evt.target as Node
    const doc = target.ownerDocument

    if (!doc) {
      // Should we capture events without targets?
      return
    }

    const x = evt.clientX
    const y = evt.clientY

    const targets = doc.elementsFromPoint(x, y).map(elem => getNodeId(elem))

    callback(
      new Box({
        type: InteractionType.PointerDown,
        targets,
        at: [x, y],
      })
    )
  })
}

function createPointerUpObserver(callback: Callback): ObserverLike<Document> {
  return createEventObserver('pointerup', evt => {
    const target = evt.target as Node
    const doc = target.ownerDocument

    if (!doc) {
      // Should we capture events without targets?
      return
    }

    const x = evt.clientX
    const y = evt.clientY

    const targets = doc.elementsFromPoint(x, y).map(elem => getNodeId(elem))

    callback(
      new Box({
        type: InteractionType.PointerUp,
        targets,
        at: [x, y],
      })
    )
  })
}

function createClickObserver(
  callback: Callback,
  options: RecordingOptions
): ObserverLike<Document> {
  return createEventObserver('click', evt => {
    const target = evt.target as Node
    const doc = target.ownerDocument

    if (!doc) {
      return
    }

    if (!isElementNode(target)) {
      return
    }

    if (
      isIgnoredByNode(target, options.ignoredNodes) ||
      isIgnoredBySelector(target, options.ignoredSelectors)
    ) {
      return
    }

    const x = evt.clientX
    const y = evt.clientY

    const targets = doc.elementsFromPoint(x, y).map(elem => getNodeId(elem))
    const tagName = target.nodeName.toLowerCase()
    const humanReadableLabel =
      tagName === 'a' || tagName === 'button' ? target.textContent : null

    callback(
      new Box({
        type: InteractionType.Click,
        button: evt.button,
        targets,
        at: [x, y],
        meta: {
          node: createVElement(target),
          humanReadableLabel,
        },
      })
    )
  })
}

function createDoubleClickObserver(
  callback: Callback,
  options: RecordingOptions
): ObserverLike<Document> {
  return createEventObserver('dblclick', evt => {
    const target = evt.target as Node
    const doc = target.ownerDocument

    if (!doc) {
      return
    }

    if (!isElementNode(target)) {
      return
    }

    if (
      isIgnoredByNode(target, options.ignoredNodes) ||
      isIgnoredBySelector(target, options.ignoredSelectors)
    ) {
      return
    }

    const x = evt.clientX
    const y = evt.clientY

    const targets = doc.elementsFromPoint(x, y).map(elem => getNodeId(elem))

    callback(
      new Box({
        type: InteractionType.Click,
        button: evt.button,
        targets,
        at: [x, y],
        meta: {
          node: createVElement(target),
          humanReadableLabel: null,
        },
      })
    )
  })
}

function shouldCaptureKeyEvent(activeElement: Node | null) {
  return (
    !activeElement ||
    (!isInputElement(activeElement) &&
      !isSelectElement(activeElement) &&
      !isTextAreaElement(activeElement))
  )
}

function createKeyDownObserver(callback: Callback): ObserverLike {
  return createEventObserver('keydown', evt => {
    if (shouldCaptureKeyEvent(document.activeElement)) {
      callback(
        new Box({
          type: InteractionType.KeyDown,
          key: evt.key,
        })
      )
    }
  })
}

function createKeyUpObserver(callback: Callback): ObserverLike {
  return createEventObserver('keyup', evt => {
    if (shouldCaptureKeyEvent(document.activeElement)) {
      callback(
        new Box({
          type: InteractionType.KeyUp,
          key: evt.key,
        })
      )
    }
  })
}

function createPageTransitionObserver(callback: Callback): ObserverLike {
  let currentPageURL: string | null = null

  function capturePageTransition() {
    const nextPageURL = globalThis.location.href

    if (nextPageURL !== currentPageURL) {
      callback(
        new Box({
          type: InteractionType.PageTransition,
          from: currentPageURL,
          to: nextPageURL,
        })
      )

      currentPageURL = nextPageURL
    }
  }

  const historyObserver = createEventObserver('popstate', capturePageTransition)
  const hashObserver = createEventObserver('hashchange', capturePageTransition)

  return {
    disconnect() {
      historyObserver.disconnect()
      hashObserver.disconnect()
    },

    observe(doc, vtree) {
      historyObserver.observe(doc.defaultView, vtree)
      hashObserver.observe(doc.defaultView, vtree)
      capturePageTransition()
    },
  }
}
