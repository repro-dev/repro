import expect from 'expect'
import { describe, it } from 'node:test'
import { buildAST } from './buildAST'
import { topologicalSort } from './topologicalSort'
import { Module } from './types'

describe('topologicalSort', () => {
  it('should sort modules topologically', () => {
    const a: Module = {
      name: 'a',
      filename: 'a.tdls',
      ast: buildAST(`
        import b.Bar
        import c.{Baz, Qux}
      `),
    }

    const b: Module = {
      name: 'b',
      filename: 'b.tdls',
      ast: buildAST(`
        import c.Baz
        type Bar: Baz
      `),
    }

    const c: Module = {
      name: 'c',
      filename: 'c.tdls',
      ast: buildAST(`
        type Baz: string
        type Qux: uint16
      `),
    }

    const d: Module = {
      name: 'd',
      filename: 'd.tdls',
      ast: buildAST(`
        import c.Qux
      `),
    }

    expect(topologicalSort([a, b, c, d])).toEqual([c, b, d, a])
    expect(topologicalSort([b, a, d, c])).toEqual([c, b, d, a])
  })

  it('should fail if there is a circular dependency', () => {
    const a: Module = {
      name: 'a',
      filename: 'a.tdls',
      ast: buildAST(`
        import b.Bar
        import c.{Baz, Qux}
        type Foo: char[4]
      `),
    }

    const b: Module = {
      name: 'b',
      filename: 'b.tdls',
      ast: buildAST(`
        import c.Baz
        type Bar: Baz
      `),
    }

    const c: Module = {
      name: 'c',
      filename: 'c.tdls',
      ast: buildAST(`
        import a.Foo
        type Baz: string
        type Qux: uint16
      `),
    }

    expect(() => topologicalSort([a, b, c])).toThrowError()
  })
})
