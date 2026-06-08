import type { Audience, DiagnosisContent, Hypothesis } from '@repro/agentic'
import { cleanup, render, screen } from '@testing-library/react'
import expect from 'expect'
import { afterEach, describe, it } from 'node:test'
import React from 'react'
import { DiagnosisBlock } from './DiagnosisBlock'

afterEach(() => {
  cleanup()
})

function makeContent(
  overrides: Partial<DiagnosisContent> = {}
): DiagnosisContent {
  return {
    diagnosis:
      overrides.diagnosis ??
      'The form submission failed due to a CSRF token mismatch.',
    inference:
      overrides.inference ??
      'The token expired between page load and form submission.',
    recommendations: overrides.recommendations ?? [
      'Increase CSRF token lifetime',
    ],
  }
}

function makeHypothesis(
  overrides: Partial<Hypothesis> = {},
  id: string = 'h1'
): Hypothesis {
  return {
    id,
    description: overrides.description ?? 'CSRF token expired',
    evidence: overrides.evidence ?? ['Console error at 35m'],
    confidence: overrides.confidence ?? 'high',
  }
}

describe('DiagnosisBlock', () => {
  const defaultProps = {
    diagnosisContent: makeContent(),
    topHypothesis: makeHypothesis(),
    allHypotheses: [makeHypothesis()],
    audience: 'extension' as Audience,
    onAction: () => {},
  }

  it('renders diagnosis statement from DiagnosisContent', () => {
    render(<DiagnosisBlock {...defaultProps} />)

    expect(
      screen.getByText(
        'The form submission failed due to a CSRF token mismatch.'
      )
    ).toBeDefined()
  })

  it('renders confidence badge using topHypothesis.confidence', () => {
    render(
      <DiagnosisBlock
        {...defaultProps}
        topHypothesis={makeHypothesis({ confidence: 'high' })}
      />
    )

    expect(screen.getByText('high')).toBeDefined()
  })

  it('shows evidence section open by default with correct items', () => {
    render(
      <DiagnosisBlock
        {...defaultProps}
        topHypothesis={makeHypothesis({
          evidence: ['Console error at 35m', 'Network 403 response'],
        })}
      />
    )

    expect(screen.getByText('Evidence')).toBeDefined()
    expect(screen.getByText('Console error at 35m')).toBeDefined()
    expect(screen.getByText('Network 403 response')).toBeDefined()
  })

  it('shows inference section with collapsed by default', () => {
    render(<DiagnosisBlock {...defaultProps} />)

    expect(screen.getByText('How we got here')).toBeDefined()
    expect(
      screen.getByText(
        'The token expired between page load and form submission.'
      )
    ).toBeDefined()
  })

  it('shows secondary hypotheses when there are 2+', () => {
    const hypotheses = [
      makeHypothesis({ description: 'Primary hypothesis' }, 'h1'),
      makeHypothesis({ description: 'Secondary hypothesis' }, 'h2'),
    ]

    render(
      <DiagnosisBlock
        {...defaultProps}
        allHypotheses={hypotheses}
        topHypothesis={hypotheses[0] ?? null}
      />
    )

    expect(screen.getByText(/1 other hypothesis/)).toBeDefined()
  })

  it('hides secondary hypotheses when there is only 1', () => {
    render(<DiagnosisBlock {...defaultProps} />)

    expect(screen.queryByText(/other hypothesis/)).toBeNull()
  })

  it('shows only extension-appropriate actions for audience="extension"', () => {
    render(<DiagnosisBlock {...defaultProps} audience="extension" />)

    expect(screen.getByText('File issue')).toBeDefined()
    expect(screen.getByText('Continue investigating')).toBeDefined()
    expect(screen.queryByText('Prepare dev context')).toBeNull()
    expect(screen.queryByText('Inspect user journey')).toBeNull()
  })

  it('shows workspace actions for audience="workspace"', () => {
    render(<DiagnosisBlock {...defaultProps} audience="workspace" />)

    expect(screen.getByText('File issue')).toBeDefined()
    expect(screen.getByText('Continue investigating')).toBeDefined()
    expect(screen.getByText('Prepare dev context')).toBeDefined()
    expect(screen.getByText('Inspect user journey')).toBeDefined()
  })

  it('calls onAction with correct action id when a chip is clicked', () => {
    const actions: string[] = []

    render(
      <DiagnosisBlock
        {...defaultProps}
        audience="extension"
        onAction={action => {
          actions.push(action)
        }}
      />
    )

    const fileIssueButton = screen.getByText('File issue')
    fileIssueButton.click()

    expect(actions).toEqual(['file-issue'])
  })

  it('renders ResponseFeedback when onFeedback is provided', () => {
    render(<DiagnosisBlock {...defaultProps} onFeedback={() => {}} />)

    // Thumbs up button should be present
    expect(screen.getByLabelText('Thumbs up')).toBeDefined()
    expect(screen.getByLabelText('Thumbs down')).toBeDefined()
  })

  it('does not render ResponseFeedback when onFeedback is not provided', () => {
    render(<DiagnosisBlock {...defaultProps} />)

    expect(screen.queryByLabelText('Thumbs up')).toBeNull()
    expect(screen.queryByLabelText('Thumbs down')).toBeNull()
  })
})
