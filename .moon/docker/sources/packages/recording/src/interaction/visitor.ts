import { Point, SyntheticId } from '@repro/domain'
import { getNodeId } from '@repro/vdom-utils'
import { Subscribable, Subscriber, Visitor } from '../types'

type ScrollMap = Record<SyntheticId, Point>

export function createScrollVisitor() {
  let scrollMap: ScrollMap = {}
  const subscribers: Array<Subscriber<ScrollMap>> = []

  const scrollVisitor: Visitor<ScrollMap> & Subscribable<ScrollMap> = {
    elementNode(node) {
      // Note: this triggers a reflow for every element
      // TODO: investigate performance
      scrollMap[getNodeId(node)] = [node.scrollLeft, node.scrollTop]
    },

    documentNode(node) {
      const { scrollLeft, scrollTop } = node.documentElement
      scrollMap[getNodeId(node.documentElement)] = [scrollLeft, scrollTop]
    },

    // Not implemented
    documentFragmentNode() {},
    documentTypeNode() {},
    textNode() {},

    done() {
      const value = scrollMap

      for (const subscriber of subscribers) {
        subscriber(value)
      }

      scrollMap = {}
      return value
    },

    subscribe(subscriber) {
      subscribers.push(subscriber)
    },
  }

  return scrollVisitor
}

export function createViewportVisitor() {
  let viewport: Point | null = null
  const subscribers: Array<Subscriber<Point>> = []

  const viewportVisitor: Visitor<Point> & Subscribable<Point> = {
    documentNode(node) {
      const win = node.defaultView

      if (win && win.top === win.self) {
        viewport = [win.innerWidth, win.innerHeight]
      }
    },

    // Not implemented
    documentFragmentNode() {},
    documentTypeNode() {},
    elementNode() {},
    textNode() {},

    done() {
      const value = viewport

      if (value) {
        for (const subscriber of subscribers) {
          subscriber(value)
        }
      }

      viewport = null
      return value
    },

    subscribe(subscriber) {
      subscribers.push(subscriber)
    },
  }

  return viewportVisitor
}
