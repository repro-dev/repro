/**
 * @jest-environment jsdom
 */

import {
  NetworkMessage,
  NetworkMessageType,
  NodeType,
  RequestType,
  VTree,
} from '@repro/domain'
import expect from 'expect'
// @ts-ignore
import nativeFetch from 'isomorphic-fetch'
import { newMockXhr } from 'mock-xmlhttprequest'
import { afterEach, describe, it } from 'node:test'
// import fetch, { Request } from 'node-fetch'
import { ObserverLike } from '@repro/observer-utils'
import { Box } from '@repro/tdl'
import { createNetworkObserver } from './observe'

describe('libs/record: network observers', () => {
  const vtree: VTree = {
    rootId: 'foo',
    nodes: {
      foo: new Box({
        id: 'foo',
        parentId: null,
        type: NodeType.Document,
        children: [],
      }),
    },
  }

  let observer: ObserverLike | null = null

  afterEach(() => {
    if (observer) {
      observer.disconnect()
    }
  })

  describe('XHR', () => {
    it('should not record request credential headers', () => {
      const MockXHR = newMockXhr()
      global.XMLHttpRequest = MockXHR

      // @ts-ignore
      global.fetch = nativeFetch

      const method = 'GET'
      const url = 'https://example.text/xhr'
      const body = new ArrayBuffer(0)

      function subscriber(message: NetworkMessage) {
        const correlationId = message
          .map(message => message.correlationId)
          .unwrap()

        expect(message).toEqual(
          new Box({
            type: NetworkMessageType.FetchRequest,
            requestType: RequestType.XHR,
            correlationId,
            url,
            method,
            headers: {
              'Content-Type': 'application/json',
              'Content-Encoding': 'gzip',
            },
            body,
          })
        )
      }

      observer = createNetworkObserver(subscriber)
      observer.observe(document, vtree)

      const xhr = new XMLHttpRequest()
      xhr.open(method, url)
      xhr.setRequestHeader('Content-Type', 'application/json')
      xhr.setRequestHeader('Content-Encoding', 'gzip')
      xhr.setRequestHeader('Cookie', 'super+secret+do+not+share')
      xhr.setRequestHeader('Authorization', 'guard+with+your+life')
      xhr.send(body)
    })
  })

  // describe('fetch', () => {
  //   it('should not record request credential headers', () => {
  //     const MockXHR = newMockXhr()
  //     global.XMLHttpRequest = MockXHR

  //     // @ts-ignore
  //     global.fetch = fetch

  //     // @ts-ignore
  //     global.Request = Request

  //     const method = 'GET'
  //     const url = 'https://example.text/xhr'

  //     // TODO: find a way to support ArrayBuffer in node-fetch BodyInit
  //     const body = Buffer.alloc(0)

  //     function subscriber(message: NetworkMessage) {
  //       expect(message).toEqual<NetworkMessage>({
  //         type: NetworkMessageType.FetchRequest,
  //         requestType: RequestType.XHR,
  //         correlationId: message.correlationId,
  //         url,
  //         method,
  //         headers: {
  //           'Content-Type': 'application/json',
  //           'Content-Encoding': 'gzip',
  //         },
  //         body,
  //       })
  //     }

  //     observer = createNetworkObserver(subscriber)
  //     observer.observe(document, vtree)

  //     fetch(url, {
  //       method,
  //       body,
  //       headers: {
  //         'Content-Type': 'application/json',
  //         'Content-Encoding': 'gzip',
  //         Cookie: 'super+secret+do+not+share',
  //         Authorization: 'guard+with+your+life',
  //       },
  //     })
  //   })
  // })
})
