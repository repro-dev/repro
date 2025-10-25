import expect from 'expect'
import { describe, it } from 'node:test'
import { Interval } from 'ohm-js'
import { AssignmentNode, ASTNodeType, IntegerTypeNode } from './ASTTypes'
import { parse } from './index'
import { Program } from './types'

describe('TDL: parser', () => {
  const interval = expect.anything() as unknown as Interval

  it('should parse a simple schema', () => {
    const input = `
      type Foo: uint8
      type Bar: ?string
    `

    const Foo: AssignmentNode = {
      type: ASTNodeType.Assignment,
      name: 'Foo',
      value: {
        type: ASTNodeType.IntegerType,
        signed: false,
        bytes: 1,
        interval,
      },
      interval,
    }

    const Bar: AssignmentNode = {
      type: ASTNodeType.Assignment,
      name: 'Bar',
      value: {
        type: ASTNodeType.Option,
        value: {
          type: ASTNodeType.StringType,
          interval,
        },
        interval,
      },
      interval,
    }

    const result = parse({
      directory: 'test',
      sourceLoader: () => [['test/input.tdls', input]],
    })

    const expected: Program = [
      {
        name: 'input',
        filename: 'test/input.tdls',
        ast: {
          type: ASTNodeType.StatementSet,
          statements: [Foo, Bar],
          interval,
        },
      },
    ]

    expect(result).toEqual(expected)
  })

  it('should parse a schema with reference types', () => {
    const input = `
      type Foo: uint8
      type Bar: Foo
      type Baz: struct {
        0) id: char[4]
        1) name: string
        2) value: Bar
        3) oldValue: ?Bar
      }
    `

    const Foo: AssignmentNode = {
      type: ASTNodeType.Assignment,
      name: 'Foo',
      value: {
        type: ASTNodeType.IntegerType,
        signed: false,
        bytes: 1,
        interval,
      },
      interval,
    }

    const Bar: AssignmentNode = {
      type: ASTNodeType.Assignment,
      name: 'Bar',
      value: {
        type: ASTNodeType.Reference,
        name: 'Foo',
        resolvedType: Foo.value as IntegerTypeNode,
        interval,
      },
      interval,
    }

    const Baz: AssignmentNode = {
      type: ASTNodeType.Assignment,
      name: 'Baz',
      value: {
        type: ASTNodeType.StructType,
        properties: [
          {
            type: ASTNodeType.StructProperty,
            name: 'id',
            value: {
              type: ASTNodeType.CharType,
              bytes: 4,
              interval,
            },
            interval,
          },

          {
            type: ASTNodeType.StructProperty,
            name: 'name',
            value: {
              type: ASTNodeType.StringType,
              interval,
            },
            interval,
          },

          {
            type: ASTNodeType.StructProperty,
            name: 'value',
            value: {
              type: ASTNodeType.Reference,
              name: 'Bar',
              resolvedType: Foo.value as IntegerTypeNode,
              interval,
            },
            interval,
          },

          {
            type: ASTNodeType.StructProperty,
            name: 'oldValue',
            value: {
              type: ASTNodeType.Option,
              value: {
                type: ASTNodeType.Reference,
                name: 'Bar',
                resolvedType: Foo.value as IntegerTypeNode,
                interval,
              },
              interval,
            },
            interval,
          },
        ],
        interval,
      },
      interval,
    }

    const expected: Program = [
      {
        name: 'input',
        filename: 'test/input.tdls',
        ast: {
          type: ASTNodeType.StatementSet,
          statements: [Foo, Bar, Baz],
          interval,
        },
      },
    ]

    const result = parse({
      directory: 'test',
      sourceLoader: () => [['test/input.tdls', input]],
    })

    expect(result).toEqual(expected)
  })
})
