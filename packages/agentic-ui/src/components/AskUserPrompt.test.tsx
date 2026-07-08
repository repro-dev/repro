import type { AskUserRequest } from '@repro/agentic'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import expect from 'expect'
import { afterEach, describe, it } from 'node:test'
import React from 'react'
import { AskUserPrompt } from './AskUserPrompt'

function makeRequest(overrides: Partial<AskUserRequest> = {}): AskUserRequest {
  return {
    prompt: 'What would you like to do?',
    ...overrides,
  }
}

afterEach(() => {
  cleanup()
})

describe('AskUserPrompt', () => {
  it('renders the prompt text', () => {
    render(
      <AskUserPrompt
        request={makeRequest()}
        toolCallId="tc1"
        onSubmit={() => {}}
      />
    )

    expect(screen.getByText('What would you like to do?')).toBeDefined()
  })

  it('renders choices for single-select mode', () => {
    render(
      <AskUserPrompt
        request={makeRequest({
          choices: [
            { label: 'Option A', value: 'a' },
            { label: 'Option B', value: 'b' },
          ],
          multiple: false,
        })}
        toolCallId="tc1"
        onSubmit={() => {}}
      />
    )

    expect(screen.getByText('Option A')).toBeDefined()
    expect(screen.getByText('Option B')).toBeDefined()
    // Should be radio buttons from RadioGroup
    expect(screen.getByRole('radio', { name: 'Option A' })).toBeDefined()
    expect(screen.getByRole('radio', { name: 'Option B' })).toBeDefined()
  })

  it('single-select: selecting one deselects others', () => {
    render(
      <AskUserPrompt
        request={makeRequest({
          choices: [
            { label: 'Option A', value: 'a' },
            { label: 'Option B', value: 'b' },
          ],
        })}
        toolCallId="tc1"
        onSubmit={() => {}}
      />
    )

    const radioA = screen.getByRole('radio', {
      name: 'Option A',
    }) as HTMLInputElement
    const radioB = screen.getByRole('radio', {
      name: 'Option B',
    }) as HTMLInputElement

    fireEvent.click(radioA)
    expect(radioA.checked).toBe(true)
    expect(radioB.checked).toBe(false)

    fireEvent.click(radioB)
    expect(radioA.checked).toBe(false)
    expect(radioB.checked).toBe(true)
  })

  it('multi-select: renders checkboxes and allows multiple selection', () => {
    render(
      <AskUserPrompt
        request={makeRequest({
          choices: [
            { label: 'Option A', value: 'a' },
            { label: 'Option B', value: 'b' },
            { label: 'Option C', value: 'c' },
          ],
          multiple: true,
        })}
        toolCallId="tc1"
        onSubmit={() => {}}
      />
    )

    const cbA = screen.getByRole('checkbox', {
      name: 'Option A',
    }) as HTMLInputElement
    const cbB = screen.getByRole('checkbox', {
      name: 'Option B',
    }) as HTMLInputElement

    fireEvent.click(cbA)
    fireEvent.click(cbB)

    expect(cbA.checked).toBe(true)
    expect(cbB.checked).toBe(true)
  })

  it('freeform mode: renders a textarea', () => {
    render(
      <AskUserPrompt
        request={makeRequest({
          choices: undefined,
          allowFreeform: true,
        })}
        toolCallId="tc1"
        onSubmit={() => {}}
      />
    )

    // TextField wraps the textarea with a label showing the prompt text
    expect(
      screen.getByRole('textbox', { name: 'What would you like to do?' })
    ).toBeDefined()
  })

  it('mixed mode (select + freeform): renders both choice list and textarea', () => {
    render(
      <AskUserPrompt
        request={makeRequest({
          choices: [{ label: 'Choice 1', value: 'c1' }],
          allowFreeform: true,
        })}
        toolCallId="tc1"
        onSubmit={() => {}}
      />
    )

    expect(screen.getByText('Choice 1')).toBeDefined()
    expect(
      screen.getByRole('textbox', { name: 'Additional details' })
    ).toBeDefined()
  })

  it('prompt-only mode: renders prompt text and "Got it" button', () => {
    render(
      <AskUserPrompt
        request={makeRequest({
          choices: undefined,
          allowFreeform: undefined,
        })}
        toolCallId="tc1"
        onSubmit={() => {}}
      />
    )

    expect(screen.getByText('What would you like to do?')).toBeDefined()
    expect(screen.getByRole('button', { name: 'Got it' })).toBeDefined()
  })

  it('submit calls onSubmit with selected answer in single-select mode', () => {
    let submitted: unknown = null

    render(
      <AskUserPrompt
        request={makeRequest({
          choices: [
            { label: 'Option A', value: 'a' },
            { label: 'Option B', value: 'b' },
          ],
        })}
        toolCallId="tc1"
        onSubmit={result => {
          submitted = result
        }}
      />
    )

    fireEvent.click(screen.getByRole('radio', { name: 'Option A' }))
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }))

    expect(submitted).toEqual({ answer: 'a' })
  })

  it('submit calls onSubmit with selected answers in multi-select mode', () => {
    let submitted: unknown = null

    render(
      <AskUserPrompt
        request={makeRequest({
          choices: [
            { label: 'A', value: 'a' },
            { label: 'B', value: 'b' },
            { label: 'C', value: 'c' },
          ],
          multiple: true,
        })}
        toolCallId="tc1"
        onSubmit={result => {
          submitted = result
        }}
      />
    )

    fireEvent.click(screen.getByRole('checkbox', { name: 'A' }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'C' }))
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }))

    expect(submitted).toEqual({ answer: ['a', 'c'] })
  })

  it('submit with freeform includes freeformAnswer', () => {
    let submitted: unknown = null

    render(
      <AskUserPrompt
        request={makeRequest({
          choices: [{ label: 'A', value: 'a' }],
          allowFreeform: true,
        })}
        toolCallId="tc1"
        onSubmit={result => {
          submitted = result
        }}
      />
    )

    fireEvent.click(screen.getByRole('radio', { name: 'A' }))
    fireEvent.change(
      screen.getByRole('textbox', { name: 'Additional details' }),
      {
        target: { value: 'some extra info' },
      }
    )
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }))

    expect(submitted).toEqual({
      answer: 'a',
      freeformAnswer: 'some extra info',
    })
  })

  it('acknowledge in prompt-only mode calls onSubmit with answer "acknowledged"', () => {
    let submitted: unknown = null

    render(
      <AskUserPrompt
        request={makeRequest({
          choices: undefined,
          allowFreeform: undefined,
        })}
        toolCallId="tc1"
        onSubmit={result => {
          submitted = result
        }}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: 'Got it' }))
    expect(submitted).toEqual({ answer: 'acknowledged' })
  })

  it('submit button disables after first click', () => {
    render(
      <AskUserPrompt
        request={makeRequest({
          choices: [{ label: 'A', value: 'a' }],
        })}
        toolCallId="tc1"
        onSubmit={() => {}}
      />
    )

    fireEvent.click(screen.getByRole('radio', { name: 'A' }))
    const submitBtn = screen.getByRole('button', { name: 'Submit' })
    fireEvent.click(submitBtn)

    // After submit, button should show "Submitted"
    expect(screen.getByRole('button', { name: 'Submitted' })).toBeDefined()
  })

  it('renders choice description when provided', () => {
    render(
      <AskUserPrompt
        request={makeRequest({
          choices: [
            {
              label: 'Option A',
              value: 'a',
              description: 'This is description A',
            },
          ],
        })}
        toolCallId="tc1"
        onSubmit={() => {}}
      />
    )

    expect(screen.getByText('This is description A')).toBeDefined()
  })
})
