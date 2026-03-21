import assert from 'node:assert/strict'
import { describe, it, mock } from 'node:test'
import { resolve, reject } from 'fluture'
import { tools } from '@repro/agentic'
import { registerTools } from './registry'

type ToolCallback = (args: Record<string, unknown>) => Promise<unknown>

interface FakeRegisteredTool {
  callback: ToolCallback
}

interface FakeMcpServer {
  _registeredTools: Record<string, FakeRegisteredTool>
  tool(
    name: string,
    description: string | undefined,
    schema: Record<string, unknown>,
    cb: ToolCallback
  ): void
}

function makeFakeServer(): FakeMcpServer {
  const server: FakeMcpServer = {
    _registeredTools: {},
    tool(name, _description, _schema, cb) {
      server._registeredTools[name] = { callback: cb }
    },
  }
  return server
}

function makeAccessor() {
  return {
    getDuration: () => 1000,
    getSourceEvents: () => {
      throw new Error('not needed')
    },
    getSnapshotAtTime: () => null,
  }
}

describe('registerTools', () => {
  it('registers a non-zero number of tools', () => {
    const server = makeFakeServer()
    registerTools(server as never, mock.fn(() => resolve(makeAccessor())))
    assert.ok(Object.keys(server._registeredTools).length > 0)
  })

  it('registers every tool from @repro/agentic tools array', () => {
    const server = makeFakeServer()
    registerTools(server as never, mock.fn(() => resolve(makeAccessor())))
    for (const tool of tools) {
      const name = tool.function.name
      assert.ok(
        Object.prototype.hasOwnProperty.call(server._registeredTools, name),
        `expected tool "${name}" to be registered`
      )
    }
  })

  it('calls createAccessor with the recordingId from tool args', async () => {
    const server = makeFakeServer()
    const createAccessor = mock.fn((_id: string) => resolve(makeAccessor()))
    registerTools(server as never, createAccessor)

    const firstToolName = tools[0]?.function.name
    assert.ok(firstToolName)
    const entry = server._registeredTools[firstToolName]
    assert.ok(entry)

    await entry.callback({ recordingId: 'abc123' })
    assert.equal(createAccessor.mock.calls.length, 1)
    assert.equal(createAccessor.mock.calls[0]?.arguments[0], 'abc123')
  })

  it('propagates errors from createAccessor as a rejected promise', async () => {
    const server = makeFakeServer()
    const err = new Error('load failed')
    registerTools(server as never, mock.fn(() => reject(err)))

    const firstToolName = tools[0]?.function.name
    assert.ok(firstToolName)
    const entry = server._registeredTools[firstToolName]
    assert.ok(entry)

    await assert.rejects(() => entry.callback({ recordingId: 'bad-id' }), err)
  })

  it('strips recordingId before passing args to executeTool', async () => {
    const server = makeFakeServer()
    registerTools(server as never, mock.fn(() => resolve(makeAccessor())))

    const firstToolName = tools[0]?.function.name
    assert.ok(firstToolName)
    const entry = server._registeredTools[firstToolName]
    assert.ok(entry)

    const result = (await entry.callback({ recordingId: 'rid' })) as {
      content: Array<{ type: string; text: string }>
    }
    assert.ok(result.content.length > 0)
    assert.equal(result.content[0]?.type, 'text')
  })
})
