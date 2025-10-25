import expect from 'expect'
import { describe, it } from 'node:test'
import { createMigrate } from './createMigrate'

const migrate = createMigrate([
  {
    version: '0.9.0',

    up(data) {
      data.foo = 'bar'
    },

    down(data) {
      data.foo = 'foo'
    },
  },

  {
    version: '1.0.0',

    up(data) {
      data.bar = 'baz'
    },

    down(data) {
      data.bar = 'bar'
    },
  },

  {
    version: '1.0.1',

    up(data) {
      data.bar = 'bazbaz'
    },

    down(data) {
      data.bar = 'baz'
    },
  },

  {
    version: '1.1.0',

    up(data) {
      data.baz = 'qux'
    },

    down(data) {
      data.baz = 'baz'
    },
  },
])

describe('Domain migrations', () => {
  it('should migrate up from a lower codec version', () => {
    const input = {
      foo: 'foo',
      bar: 'bar',
      baz: 'baz',
    }

    migrate(input, '0.5.0', '1.5.0')

    expect(input).toEqual({
      foo: 'bar',
      bar: 'bazbaz',
      baz: 'qux',
    })
  })

  it('should only migrate up for versions in range', () => {
    const input = {
      foo: 'bar',
      bar: 'baz',
      baz: 'baz',
    }

    migrate(input, '1.0.0', '1.0.1')

    expect(input).toEqual({
      foo: 'bar',
      bar: 'bazbaz',
      baz: 'baz',
    })
  })

  it('should migrate down from a higher codec version', () => {
    const input = {
      foo: 'bar',
      bar: 'bazbaz',
      baz: 'qux',
    }

    migrate(input, '1.5.0', '0.5.0')

    expect(input).toEqual({
      foo: 'foo',
      bar: 'bar',
      baz: 'baz',
    })
  })

  it('should only migrate down for versions in range', () => {
    const input = {
      foo: 'bar',
      bar: 'bazbaz',
      baz: 'baz',
    }

    migrate(input, '1.0.1', '1.0.0')

    expect(input).toEqual({
      foo: 'bar',
      bar: 'baz',
      baz: 'baz',
    })
  })

  it('should not migrate if codec versions match', () => {
    const input = {
      foo: 'foo',
      bar: 'bar',
      baz: 'baz',
    }

    migrate(input, '0.9.0', '0.9.0')

    expect(input).toEqual({
      foo: 'foo',
      bar: 'bar',
      baz: 'baz',
    })
  })
})
