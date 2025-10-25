import expect from 'expect'
import { describe, it } from 'node:test'
import { ASTNodeType } from './ASTTypes'
import { buildAST } from './buildAST'
import { ResolutionError } from './errors'
import { resolveReferences } from './resolveReferences'
import { Module, Program } from './types'
import { throwFirstOfType } from './utils'

const interval = expect.anything()

describe('resolveReferences', () => {
  it('should resolve references', () => {
    const a: Module = {
      name: 'a',
      filename: 'a.tdls',
      ast: buildAST(`
        type A: uint8
      `),
    }

    const b: Module = {
      name: 'b',
      filename: 'b.tdls',
      ast: buildAST(`
        import a.A
        type B: ?A
      `),
    }

    const c: Module = {
      name: 'c',
      filename: 'c.tdls',
      ast: buildAST(`
        import b.B
        type C: B
      `),
    }

    const program: Program = [a, b, c]
    resolveReferences(program)

    expect(program).toEqual([
      {
        name: 'a',
        filename: 'a.tdls',
        ast: {
          type: ASTNodeType.StatementSet,
          statements: [
            {
              type: ASTNodeType.Assignment,
              name: 'A',
              value: {
                type: ASTNodeType.IntegerType,
                signed: false,
                bytes: 1,
                interval,
              },
              interval,
            },
          ],
          interval,
        },
      },

      {
        name: 'b',
        filename: 'b.tdls',
        ast: {
          type: ASTNodeType.StatementSet,
          statements: [
            {
              type: ASTNodeType.ImportDeclaration,
              module: 'a',
              importNames: {
                type: ASTNodeType.SingleNamedImport,
                name: 'A',
                interval,
              },
              interval,
            },
            {
              type: ASTNodeType.Assignment,
              name: 'B',
              value: {
                type: ASTNodeType.Option,
                value: {
                  type: ASTNodeType.Reference,
                  name: 'A',
                  resolvedType: {
                    type: ASTNodeType.IntegerType,
                    signed: false,
                    bytes: 1,
                    interval,
                  },
                  interval,
                },
                interval,
              },
              interval,
            },
          ],
          interval,
        },
      },

      {
        name: 'c',
        filename: 'c.tdls',
        ast: {
          type: ASTNodeType.StatementSet,
          statements: [
            {
              type: ASTNodeType.ImportDeclaration,
              module: 'b',
              importNames: {
                type: ASTNodeType.SingleNamedImport,
                name: 'B',
                interval,
              },
              interval,
            },
            {
              type: ASTNodeType.Assignment,
              name: 'C',
              value: {
                type: ASTNodeType.Reference,
                name: 'B',
                resolvedType: {
                  type: ASTNodeType.Option,
                  value: {
                    type: ASTNodeType.IntegerType,
                    signed: false,
                    bytes: 1,
                    interval,
                  },
                  interval,
                },
                interval,
              },
              interval,
            },
          ],
          interval,
        },
      },
    ])
  })

  it('should throw an error if a reference cannot be resolved', () => {
    const a: Module = {
      name: 'a',
      filename: 'a.tdls',
      ast: buildAST(`
        type A: uint8
        type B: DoesNotExist
      `),
    }

    const program: Program = [a]

    expect(() =>
      throwFirstOfType(ResolutionError, () => resolveReferences(program))
    ).toThrowError(ResolutionError)
  })
})
