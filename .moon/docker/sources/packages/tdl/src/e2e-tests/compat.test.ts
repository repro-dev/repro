import expect from 'expect'
import { describe, it } from 'node:test'
import ts from 'typescript'
import { compile } from '../cli/compiler'
import { parse } from '../cli/parser'
import { Module } from '../cli/parser/types'
import { Box } from '../lib/Box'

async function interpret(source: string) {
  const program = parse({
    directory: 'interpreter',
    sourceLoader: () => [['source', source]],
  })

  const tsOutput = await compile((program?.[0] as Module).ast)

  const jsOutput = ts.transpileModule(tsOutput, {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
    renamedDependencies: {
      '@repro/tdl': '../',
    },
  })

  return eval(`
    'use strict';
    (function() {
      let exports = {};
      ${jsOutput.outputText};
      return exports;
    })();
  `)
}

describe('Compatibility', () => {
  it('should be backwards-compatible when a new property is added to a struct', async () => {
    const VersionA = await interpret(`
      type MyStruct: struct {
        0) foo: uint8
        1) bar: map<string, string>
      }
    `)

    const dataView = VersionA.MyStructView.encode({
      foo: 128,
      bar: {
        a: 'a',
        b: 'b',
      },
    })

    const VersionB = await interpret(`
      type MyStruct: struct {
        0) foo: uint8
        1) bar: map<string, string>
        2) baz: vector<int8>
      }
    `)

    expect(VersionB.MyStructView.decode(dataView)).toEqual({
      foo: 128,
      bar: {
        a: 'a',
        b: 'b',
      },
      baz: [],
    })

    expect(VersionB.MyStructView.over(dataView)).toEqual({
      foo: 128,
      bar: {
        a: 'a',
        b: 'b',
      },
      baz: [],
    })
  })

  it('should be forwards-compatible when a new property is added to a struct', async () => {
    const VersionA = await interpret(`
      type MyStruct: struct {
        0) foo: uint8
        1) bar: map<string, string>
      }
    `)

    const VersionB = await interpret(`
      type MyStruct: struct {
        0) foo: uint8
        1) bar: map<string, string>
        2) baz: vector<int8>
      }
    `)

    const dataView = VersionB.MyStructView.encode({
      foo: 128,
      bar: {
        a: 'a',
        b: 'b',
      },
      baz: [1, 2, 3],
    })

    expect(VersionA.MyStructView.decode(dataView)).toEqual({
      foo: 128,
      bar: {
        a: 'a',
        b: 'b',
      },
    })

    expect(VersionA.MyStructView.over(dataView)).toEqual({
      foo: 128,
      bar: {
        a: 'a',
        b: 'b',
      },
    })
  })

  it('should be backwards-compatible when a new struct is added to a union', async () => {
    const VersionA = await interpret(`
      type StructType: enum<uint8> {
        Foo: 1
        Bar: 2
      }

      type Foo: struct {
        0) type: StructType.Foo
        1) foo: string
      }

      type Bar: struct {
        0) type: StructType.Bar
        1) bar: int32
      }

      type Any: union(type) {
        Foo
        Bar
      }
    `)

    const VersionB = await interpret(`
      type StructType: enum<uint8> {
        Foo: 1
        Bar: 2
        Baz: 3
      }

      type Foo: struct {
        0) type: StructType.Foo
        1) foo: string
      }

      type Bar: struct {
        0) type: StructType.Bar
        1) bar: int32
      }

      type Baz: struct {
        0) type: StructType.Baz
        1) baz: vector<char[2]>
      }

      type Any: union(type) {
        Foo
        Bar
        Baz
      }
    `)

    const dataView = VersionA.AnyView.encode(
      new Box({
        type: VersionA.StructType.Foo,
        foo: 'abc',
      })
    )

    expect(() => VersionB.AnyView.decode(dataView).unwrap()).not.toThrow()
    expect(VersionB.AnyView.decode(dataView).unwrap()).toEqual({
      type: VersionB.StructType.Foo,
      foo: 'abc',
    })

    expect(() => VersionB.AnyView.over(dataView).unwrap()).not.toThrow()
    expect(VersionB.AnyView.over(dataView).unwrap()).toEqual({
      type: VersionB.StructType.Foo,
      foo: 'abc',
    })
  })

  it('should be forwards-compatible when a new struct is added to a union', async () => {
    const VersionA = await interpret(`
      type StructType: enum<uint8> {
        Foo: 1
        Bar: 2
      }

      type Foo: struct {
        0) type: StructType.Foo
        1) foo: string
      }

      type Bar: struct {
        0) type: StructType.Bar
        1) bar: int32
      }

      type Any: union(type) {
        Foo
        Bar
      }
    `)

    const VersionB = await interpret(`
      type StructType: enum<uint8> {
        Foo: 1
        Bar: 2
        Baz: 3
      }

      type Foo: struct {
        0) type: StructType.Foo
        1) foo: string
      }

      type Bar: struct {
        0) type: StructType.Bar
        1) bar: int32
      }

      type Baz: struct {
        0) type: StructType.Baz
        1) baz: vector<char[2]>
      }

      type Any: union(type) {
        Foo
        Bar
        Baz
      }
    `)

    const dataView = VersionB.AnyView.encode(
      new Box({
        type: VersionB.StructType.Baz,
        baz: ['aa', 'bb'],
      })
    )

    expect(VersionA.AnyView.decode(dataView).empty()).toBeTruthy()
    expect(VersionA.AnyView.over(dataView).empty()).toBeTruthy()
  })
})
