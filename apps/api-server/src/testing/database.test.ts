import expect from 'expect'
import { describe, it } from 'node:test'

describe('setUpTestDatabase', () => {
  it('starts pg_tmp with a short post-close wait', async t => {
    const execCalls: Array<{ bin: string; args: Array<string> }> = []

    t.mock.module('get-port', {
      defaultExport: async () => 15432,
    })
    t.mock.module('teen_process', {
      namedExports: {
        exec: async (bin: string, args: Array<string>) => {
          execCalls.push({ bin, args })
          return { stdout: 'postgres://localhost/test' }
        },
      },
    })
    t.mock.module('pg', {
      namedExports: {
        Pool: class {
          end = async () => undefined
        },
      },
    })
    t.mock.module('~/migrations/migrate', {
      namedExports: {
        migrate: async () => undefined,
      },
    })
    t.mock.module('~/modules/database', {
      namedExports: {
        createPostgresDatabaseClient: () => ({}),
      },
    })

    const { setUpTestDatabase } = await import('./database.js')

    await setUpTestDatabase()

    expect(execCalls).toHaveLength(1)
    expect(execCalls[0]?.args).toEqual(['-t', '-w', '5', '-p', '15432'])
  })
})
