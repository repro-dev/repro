import { cleanup, render, screen } from '@testing-library/react'
import expect from 'expect'
import { afterEach, describe, it } from 'node:test'
import React from 'react'

describe('WebSocketConnectionList', () => {
  afterEach(() => {
    cleanup()
  })

  it('shows empty state when no connections exist', async t => {
    t.mock.module('../../hooks', {
      namedExports: {
        usePlayback: () => ({
          getSourceEvents: () => ({
            toArray: () => [],
          }),
        }),
      },
    })

    t.mock.module('@repro/source-utils', {
      namedExports: {
        findWebSocketConnections: () => [],
      },
    })

    const { WebSocketConnectionList } = await import(
      '../WebSocketConnectionList.js'
    )

    render(
      <WebSocketConnectionList
        onSelectConnection={() => {}}
        selectedCorrelationId={undefined}
      />
    )

    expect(screen.getByText('No WebSocket connections recorded')).toBeDefined()
  })

  it('renders without crashing with mocked data', async t => {
    t.mock.module('../../hooks', {
      namedExports: {
        usePlayback: () => ({
          getSourceEvents: () => ({
            toArray: () => [],
          }),
        }),
      },
    })

    t.mock.module('@repro/source-utils', {
      namedExports: {
        findWebSocketConnections: () => [],
      },
    })

    const { WebSocketConnectionList } = await import(
      '../WebSocketConnectionList.js'
    )

    const { container } = render(
      <WebSocketConnectionList
        onSelectConnection={() => {}}
        selectedCorrelationId={undefined}
      />
    )

    // Component renders without error and is present in DOM
    expect(container.textContent).toContain('No WebSocket connections')
  })
})
