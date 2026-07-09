import type { ToolMessage } from '@repro/agentic'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react'
import expect from 'expect'
import { afterEach, describe, it } from 'node:test'
import React from 'react'
import { ToolCallRow } from './ToolCallRow'
import { TOOL_RESULT_ROW_STYLES } from './toolResultRowStyles'

function makeToolResult(content: Record<string, unknown>): ToolMessage {
  return { content: JSON.stringify(content) } as unknown as ToolMessage
}

afterEach(() => {
  cleanup()
})

describe('ToolCallRow semantic result hints', () => {
  it('preserves _hint for empty getConsoleMessages results', () => {
    render(
      <ToolCallRow
        toolName="getConsoleMessages"
        result={makeToolResult({
          messages: [],
          _hint: 'Try removing the logLevel filter to see all messages.',
        })}
        isExecuting={false}
        wasCancelled={false}
      />
    )

    fireEvent.click(
      screen.getByRole('button', {
        name: 'Toggle details for getConsoleMessages',
      })
    )

    expect(screen.getByText('No console messages')).toBeDefined()
    expect(
      screen.getByText(
        'Hint: Try removing the logLevel filter to see all messages.'
      )
    ).toBeDefined()
  })

  it('preserves _hint for empty getNetworkRequests results', () => {
    render(
      <ToolCallRow
        toolName="getNetworkRequests"
        result={makeToolResult({
          requests: [],
          _hint: 'Broaden the status filter to include matching requests.',
        })}
        isExecuting={false}
        wasCancelled={false}
      />
    )

    fireEvent.click(
      screen.getByRole('button', {
        name: 'Toggle details for getNetworkRequests',
      })
    )

    expect(screen.getByText('No network requests')).toBeDefined()
    expect(
      screen.getByText(
        'Hint: Broaden the status filter to include matching requests.'
      )
    ).toBeDefined()
  })

  it('renders console messages with a structured first line', () => {
    render(
      <ToolCallRow
        toolName="getConsoleMessages"
        result={makeToolResult({
          messages: [
            {
              timeMs: 1500,
              level: 'warning',
              text: 'Retrying request',
              stack: ['app.ts:12'],
            },
          ],
        })}
        isExecuting={false}
        wasCancelled={false}
      />
    )

    fireEvent.click(
      screen.getByRole('button', {
        name: 'Toggle details for getConsoleMessages',
      })
    )

    expect(
      document.querySelector('[id^="console-message-line-1"]')
    ).toBeDefined()
    expect(
      document.querySelector('[id^="console-message-line-2"]')
    ).toBeDefined()
    expect(screen.getByText('warning')).toBeDefined()
    expect(screen.getByText('app.ts:12')).toBeDefined()
    expect(screen.getByText('Retrying request')).toBeDefined()
  })

  it('splits console messages into metadata and message lines', () => {
    render(
      <ToolCallRow
        toolName="getConsoleMessages"
        result={makeToolResult({
          messages: [
            {
              timeMs: 1500,
              level: 'error',
              text: '{' + '"ok"' + ':false}',
              stack: ['app.ts:12'],
            },
          ],
        })}
        isExecuting={false}
        wasCancelled={false}
      />
    )

    fireEvent.click(
      screen.getByRole('button', {
        name: 'Toggle details for getConsoleMessages',
      })
    )

    expect(
      document.querySelector('[id^="console-message-line-1"]')
    ).toBeDefined()
    expect(
      document.querySelector('[id^="console-message-line-2"]')
    ).toBeDefined()
    expect(screen.getByText('error')).toBeDefined()
    expect(screen.getByText('app.ts:12')).toBeDefined()
    expect(screen.queryByText('App message')).toBeNull()
  })

  it('jumps to the console message time when requested', () => {
    let jumpedTo: number | null = null

    render(
      <ToolCallRow
        toolName="getConsoleMessages"
        result={makeToolResult({
          messages: [{ timeMs: 1500, level: 'info', text: 'App initialised' }],
        })}
        isExecuting={false}
        wasCancelled={false}
        onGoToTime={timeMs => {
          jumpedTo = timeMs
        }}
      />
    )

    fireEvent.click(
      screen.getByRole('button', {
        name: 'Toggle details for getConsoleMessages',
      })
    )

    fireEvent.click(
      screen.getByRole('button', {
        name: /go to time/i,
      })
    )

    expect(jumpedTo).toBe(1500)
    expect(document.activeElement?.tagName).not.toBe('BUTTON')
  })

  it('renders the network time action without a callback', () => {
    render(
      <ToolCallRow
        toolName="getNetworkRequests"
        result={makeToolResult({
          requests: [
            {
              timeMs: 800,
              type: 'fetch',
              method: 'GET',
              url: '/api/health',
              status: 200,
              durationMs: 10,
            },
          ],
        })}
        isExecuting={false}
        wasCancelled={false}
      />
    )

    fireEvent.click(
      screen.getByRole('button', {
        name: 'Toggle details for getNetworkRequests',
      })
    )

    expect(
      screen.getByRole('button', {
        name: /go to time/i,
      })
    ).toBeDefined()
  })

  it('places the network seek action using the console offset', () => {
    const consoleRender = render(
      <ToolCallRow
        toolName="getConsoleMessages"
        result={makeToolResult({
          messages: [{ timeMs: 800, level: 'info', text: 'Console message' }],
        })}
        isExecuting={false}
        wasCancelled={false}
      />
    )

    fireEvent.click(
      within(consoleRender.container).getByRole('button', {
        name: 'Toggle details for getConsoleMessages',
      })
    )

    const consoleAction = within(consoleRender.container).getByRole('button', {
      name: /go to time/i,
    })
    const consoleActionWrapper = consoleAction.parentElement

    const networkRender = render(
      <ToolCallRow
        toolName="getNetworkRequests"
        result={makeToolResult({
          requests: [
            {
              timeMs: 800,
              type: 'fetch',
              method: 'GET',
              url: '/api/health',
              status: 200,
              durationMs: 10,
            },
          ],
        })}
        isExecuting={false}
        wasCancelled={false}
      />
    )

    fireEvent.click(
      within(networkRender.container).getByRole('button', {
        name: 'Toggle details for getNetworkRequests',
      })
    )

    const networkAction = within(networkRender.container).getByRole('button', {
      name: /go to time/i,
    })
    const networkActionWrapper = networkAction.parentElement

    expect(consoleActionWrapper).not.toBeNull()
    expect(networkActionWrapper).not.toBeNull()

    const consoleStyle = window.getComputedStyle(consoleActionWrapper!)
    const networkStyle = window.getComputedStyle(networkActionWrapper!)

    expect(consoleStyle.top).toBe(networkStyle.top)
    expect(consoleStyle.left).toBe(networkStyle.left)
    expect(networkStyle.top).toBe('-3px')
    expect(networkStyle.left).toBe('-10px')
  })

  it('keeps the time and seek action in the first grid cell', () => {
    render(
      <ToolCallRow
        toolName="getConsoleMessages"
        result={makeToolResult({
          messages: [{ timeMs: 1500, level: 'info', text: 'Console message' }],
        })}
        isExecuting={false}
        wasCancelled={false}
      />
    )

    fireEvent.click(
      screen.getByRole('button', {
        name: 'Toggle details for getConsoleMessages',
      })
    )

    const timeCell = screen.getByText('00:00:01.500')
    const seekAction = screen.getByRole('button', {
      name: /go to time/i,
    })

    expect(timeCell.parentElement?.contains(seekAction)).toBe(true)
  })

  it('uses tighter console header spacing', () => {
    render(
      <ToolCallRow
        toolName="getConsoleMessages"
        result={makeToolResult({
          messages: [
            {
              timeMs: 1500,
              level: 'warning',
              text: 'Retrying request',
              stack: ['app.ts:12'],
            },
          ],
        })}
        isExecuting={false}
        wasCancelled={false}
      />
    )

    fireEvent.click(
      screen.getByRole('button', {
        name: 'Toggle details for getConsoleMessages',
      })
    )

    const consoleHeader = screen.getByText('warning').parentElement
    const consoleLine1 = document.querySelector(
      '[id^="console-message-line-1"]'
    ) as HTMLElement | null

    expect(consoleHeader).not.toBeNull()
    expect(window.getComputedStyle(consoleHeader!).gap).toBe(
      `${TOOL_RESULT_ROW_STYLES.consoleHeaderGap}px`
    )
    expect(consoleLine1).not.toBeNull()
    expect(window.getComputedStyle(consoleLine1!).paddingLeft).toBe(
      `${TOOL_RESULT_ROW_STYLES.consoleContentShift}px`
    )
  })

  it('renders the network verb as plain text', () => {
    render(
      <ToolCallRow
        toolName="getNetworkRequests"
        result={makeToolResult({
          requests: [
            {
              timeMs: 800,
              type: 'fetch',
              method: 'GET',
              url: '/api/health',
              status: 200,
              durationMs: 10,
            },
          ],
        })}
        isExecuting={false}
        wasCancelled={false}
      />
    )

    fireEvent.click(
      screen.getByRole('button', {
        name: 'Toggle details for getNetworkRequests',
      })
    )

    expect(screen.getByText('GET')).toBeDefined()
    expect(screen.getByText('/api/health')).toBeDefined()
    expect(screen.getByText('10ms')).toBeDefined()
  })

  it('splits network requests into compact and detailed lines', () => {
    render(
      <ToolCallRow
        toolName="getNetworkRequests"
        result={makeToolResult({
          requests: [
            {
              timeMs: 800,
              type: 'fetch',
              method: 'POST',
              url: '/api/health',
              status: 201,
              durationMs: 10,
              contentType: 'application/json',
            },
          ],
        })}
        isExecuting={false}
        wasCancelled={false}
      />
    )

    fireEvent.click(
      screen.getByRole('button', {
        name: 'Toggle details for getNetworkRequests',
      })
    )

    expect(
      document.querySelector('[id^="network-request-line-1"]')
    ).toBeDefined()
    expect(
      document.querySelector('[id^="network-request-line-2"]')
    ).toBeDefined()
    expect(screen.getByText('201')).toBeDefined()
    expect(screen.getByText('POST')).toBeDefined()
    expect(screen.getByText('/api/health')).toBeDefined()
    expect(screen.getByText('application/json')).toBeDefined()
  })

  it('handles websocket requests without status or method fields', () => {
    render(
      <ToolCallRow
        toolName="getNetworkRequests"
        result={makeToolResult({
          requests: [
            {
              timeMs: 1200,
              type: 'ws',
              url: 'wss://example.test/socket',
            },
          ],
        })}
        isExecuting={false}
        wasCancelled={false}
      />
    )

    fireEvent.click(
      screen.getByRole('button', {
        name: 'Toggle details for getNetworkRequests',
      })
    )

    expect(
      document.querySelector('[id^="network-request-line-1"]')
    ).toBeDefined()
    expect(
      document.querySelector('[id^="network-request-line-2"]')
    ).toBeDefined()
    const line1 = document.querySelector(
      '[id^="network-request-line-1"]'
    ) as HTMLElement | null
    const line2 = document.querySelector(
      '[id^="network-request-line-2"]'
    ) as HTMLElement | null

    expect(line1).not.toBeNull()
    expect(line2).not.toBeNull()
    expect(within(line1!).getByText('WS')).toBeDefined()
    expect(within(line2!).getByText('wss://example.test/socket')).toBeDefined()
    expect(screen.queryByText('undefined')).toBeNull()
  })
})

describe('ToolCallRow askUser label', () => {
  it('renders "Ask user" label for askUser tool calls', () => {
    render(
      <ToolCallRow
        toolName="askUser"
        result={null}
        isExecuting={false}
        wasCancelled={false}
      />
    )

    expect(screen.getByText('Ask user')).toBeDefined()
  })

  it('renders "Ask user" even when executing', () => {
    render(
      <ToolCallRow
        toolName="askUser"
        result={null}
        isExecuting={true}
        wasCancelled={false}
      />
    )

    expect(screen.getByText('Ask user')).toBeDefined()
  })
})
