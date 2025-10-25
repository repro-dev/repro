import expect from 'expect'
import { describe, it } from 'node:test'
import { filterResourceMap } from './resources'

describe('vdom-utils: resources', () => {
  describe('filterResourceMap', () => {
    it('should only include provided resource IDs in resource map', () => {
      const resourceMap: Record<string, string> = {
        foo: 'http://example.com/foo',
        bar: 'http://example.com/bar',
        baz: 'http://example.com/baz',
      }

      expect(filterResourceMap(resourceMap, ['foo', 'baz'])).toEqual({
        foo: 'http://example.com/foo',
        baz: 'http://example.com/baz',
      })
    })
  })
})
