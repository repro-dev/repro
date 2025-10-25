import expect from 'expect'
import { describe, it } from 'node:test'
import { buildAST } from './buildAST'
import { RESERVED_KEYWORDS } from './constants'
import { ValidationError } from './errors'
import { resolveReferences } from './resolveReferences'
import { topologicalSort } from './topologicalSort'
import { Module, Program } from './types'
import { throwFirstOfType } from './utils'
import { validate } from './validate'

describe('validate', () => {
  it('should validate existing imports', () => {
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
        type B: vector<A>
      `),
    }

    const program: Program = [a, b]

    expect(() =>
      resolveReferences(topologicalSort(validate(program)))
    ).not.toThrow()
  })

  it('should fail to validate non-existing imported modules', () => {
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
        import doesnotexist.B
      `),
    }

    const program: Program = [a, b]

    expect(() =>
      throwFirstOfType(ValidationError, () =>
        validate(resolveReferences(topologicalSort(program)))
      )
    ).toThrowError(`Unknown module "doesnotexist"`)
  })

  for (const keyword of RESERVED_KEYWORDS) {
    it(`should fail to assign to reserved keyword: ${keyword}`, () => {
      const a: Module = {
        name: 'a',
        filename: 'a.tdls',
        ast: buildAST(`
          type ${keyword}: uint8
        `),
      }

      const program: Program = [a]

      expect(() =>
        throwFirstOfType(ValidationError, () =>
          validate(resolveReferences(topologicalSort(program)))
        )
      ).toThrowError(`Cannot assign to reserved keyword "${keyword}"`)
    })
  }

  it('should validate an enum', () => {
    const a: Module = {
      name: 'a',
      filename: 'a.tdls',
      ast: buildAST(`
        type A: enum<uint8> {
          Foo: 0
          Bar: 1
        }
      `),
    }

    const program: Program = [a]

    expect(() =>
      resolveReferences(topologicalSort(validate(program)))
    ).not.toThrow()
  })

  it('should fail to validate enums with duplicate properties', () => {
    const a: Module = {
      name: 'a',
      filename: 'a.tdls',
      ast: buildAST(`
        type A: enum<uint8> {
          Foo: 0
          Foo: 1
        }
      `),
    }

    const program: Program = [a]

    expect(() =>
      throwFirstOfType(ValidationError, () =>
        validate(resolveReferences(topologicalSort(program)))
      )
    ).toThrowError(`Duplicate enum property "Foo"`)
  })

  it('should fail to validate enums with duplicate values', () => {
    const a: Module = {
      name: 'a',
      filename: 'a.tdls',
      ast: buildAST(`
        type A: enum<uint8> {
          Foo: 0
          Bar: 0
        }
      `),
    }

    const program: Program = [a]

    expect(() =>
      throwFirstOfType(ValidationError, () =>
        validate(resolveReferences(topologicalSort(program)))
      )
    ).toThrowError(`Duplicate enum value "0"`)
  })

  it('should fail to validate enums with values out of range of the underlying integer type', () => {
    const a: Module = {
      name: 'a',
      filename: 'a.tdls',
      ast: buildAST(`
        type A: enum<uint8> {
          Foo: 256
        }
      `),
    }

    const program: Program = [a]

    expect(() =>
      throwFirstOfType(ValidationError, () =>
        validate(resolveReferences(topologicalSort(program)))
      )
    ).toThrowError('Enum values out of range')
  })

  it('should fail to validate a literal reference to a non-existent enum property', () => {
    const a: Module = {
      name: 'a',
      filename: 'a.tdls',
      ast: buildAST(`
        type A: enum<uint8> {
          Foo: 0
        }

        type B: A.Bar
      `),
    }

    const program: Program = [a]

    expect(() =>
      throwFirstOfType(ValidationError, () =>
        validate(resolveReferences(topologicalSort(program)))
      )
    ).toThrowError(`Property "Bar" does not exist on enum "A"`)
  })

  it('should fail to validate an array with a variable-length item type', () => {
    const a: Module = {
      name: 'a',
      filename: 'a.tdls',
      ast: buildAST(`
        type A: array[2]<string>
      `),
    }

    const program: Program = [a]

    expect(() =>
      throwFirstOfType(ValidationError, () =>
        validate(resolveReferences(topologicalSort(program)))
      )
    ).toThrowError(`Array element type must be fixed length`)
  })

  it('should fail to validate a map with a non-string-like key type', () => {
    const a: Module = {
      name: 'a',
      filename: 'a.tdls',
      ast: buildAST(`
        type A: map<uint8, string>
      `),
    }

    const program: Program = [a]

    expect(() =>
      throwFirstOfType(ValidationError, () =>
        validate(resolveReferences(topologicalSort(program)))
      )
    ).toThrowError(`Map key type must be string-like`)
  })

  it('should fail to validate a union with non-struct type properties', () => {
    const a: Module = {
      name: 'a',
      filename: 'a.tdls',
      ast: buildAST(`
        type Type: enum<uint8> {
          Foo: 0
          Bar: 1
        }

        type Foo: struct {
          0) type: Type.Foo
        }

        type Bar: struct {
          0) type: Type.Bar
        }

        type Baz: uint32

        type A: union(type) {
          Foo
          Bar
          Baz
        }
      `),
    }

    const program: Program = [a]

    expect(() =>
      throwFirstOfType(ValidationError, () =>
        validate(resolveReferences(topologicalSort(program)))
      )
    ).toThrowError(`"Baz" is not a struct type`)
  })

  it('should fail to validate a union where struct properties do not have the tag property', () => {
    const a: Module = {
      name: 'a',
      filename: 'a.tdls',
      ast: buildAST(`
        type Type: enum<uint8> {
          Foo: 0
          Bar: 1
        }

        type Foo: struct {
          0) type: Type.Foo
          1) a: uint8
        }

        type Bar: struct {
          0) b: uint16
        }

        type A: union(type) {
          Foo
          Bar
        }
      `),
    }

    const program: Program = [a]

    expect(() =>
      throwFirstOfType(ValidationError, () =>
        validate(resolveReferences(topologicalSort(program)))
      )
    ).toThrowError(`Struct "Bar" is missing the tag property "type"`)
  })

  it('should fail to validate a union where struct properties reference different enums', () => {
    const a: Module = {
      name: 'a',
      filename: 'a.tdls',
      ast: buildAST(`
        type Type: enum<uint8> {
          Foo: 0
        }

        type Type2: enum<uint8> {
          Bar: 1
        }

        type Foo: struct {
          0) type: Type.Foo
        }

        type Bar: struct {
          0) type: Type2.Bar
        }

        type A: union(type) {
          Foo
          Bar
        }
      `),
    }

    const program: Program = [a]

    expect(() =>
      throwFirstOfType(ValidationError, () =>
        validate(resolveReferences(topologicalSort(program)))
      )
    ).toThrowError(
      `Structs are not tagged with the same enum: Foo -> Type, Bar -> Type2`
    )
  })

  it('should fail to validate a union where struct properties are tagged by a non-enum type', () => {
    const a: Module = {
      name: 'a',
      filename: 'a.tdls',
      ast: buildAST(`
        type Type: uint8

        type Foo: struct {
          0) type: Type
        }

        type A: union(type) {
          Foo
        }
      `),
    }

    const program: Program = [a]

    expect(() =>
      throwFirstOfType(ValidationError, () =>
        validate(resolveReferences(topologicalSort(program)))
      )
    ).toThrowError(`Property "type" of struct "Foo" is not an enum literal`)
  })

  it('should fail to validate a union wnere multiple struct properties are tagged by the same enum value', () => {
    const a: Module = {
      name: 'a',
      filename: 'a.tdls',
      ast: buildAST(`
        type Type: enum<uint8> {
          Foo: 0
        }

        type Foo: struct {
          0) type: Type.Foo
        }

        type Bar: struct {
          0) type: Type.Foo
        }

        type A: union(type) {
          Foo
          Bar
        }
      `),
    }

    const program: Program = [a]

    expect(() =>
      throwFirstOfType(ValidationError, () =>
        validate(resolveReferences(topologicalSort(program)))
      )
    ).toThrowError(
      `Structs are tagged with the same enum value: Foo -> Type.Foo, Bar -> Type.Foo`
    )
  })
})
