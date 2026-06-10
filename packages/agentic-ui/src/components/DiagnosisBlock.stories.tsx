import { Block } from '@jsxstyle/react'
import type { Meta, StoryObj } from '@storybook/react'
import React from 'react'
import { DiagnosisBlock } from './DiagnosisBlock'

const meta: Meta<typeof DiagnosisBlock> = {
  title: 'Agentic/DiagnosisBlock',
  component: DiagnosisBlock,
  tags: ['experimental'],
  decorators: [
    Story => (
      <Block inlineSize={480} padding={16}>
        <Story />
      </Block>
    ),
  ],
  args: {
    onAction: () => {},
    onFeedback: () => {},
  },
}

export default meta

const baseDiagnosisContent = {
  diagnosis:
    'The form submission failed because the API endpoint returned a 422 validation error. The request payload was missing the required `email` field, and the client-side validation did not surface this before submission.',
  inference:
    'When the user clicked Submit, the form state was serialised without the email field because the email input had not yet triggered an onChange event. The field was pre-populated via autofill, which bypasses the browser change event in some cases. The API rejected the payload, but the error page shown to the user was a generic 500 rather than the field-level feedback the form expected.',
  recommendations: [
    'Add an explicit form-level validation pass before submission',
    'Bind to both change and input events for the email field',
    'Return field-level errors from the API instead of a generic 500',
  ],
}

const highConfidenceHypothesis = {
  id: 'h1',
  description: 'Missing `email` field in form payload due to autofill bypass',
  evidence: [
    'Console error at 4.1s: POST /api/submit returned 422',
    'Network payload at 4.1s does not include `email` field',
    'DOM state at 3.9s shows email input with value populated via autofill',
  ],
  confidence: 'high' as const,
}

const mediumConfidenceHypothesis = {
  id: 'h1',
  description: 'Missing `email` field in form payload due to autofill bypass',
  evidence: ['Console error at 4.1s: POST /api/submit returned 422'],
  confidence: 'medium' as const,
}

const lowConfidenceHypothesis = {
  id: 'h1',
  description:
    'API endpoint may have returned 422 due to a server-side validation change',
  evidence: ['Console error at 4.1s: POST /api/submit returned 422'],
  confidence: 'low' as const,
}

const secondaryHypotheses = [
  {
    id: 'h2',
    description: 'Network timeout caused partial payload transmission',
    evidence: ['Request duration was 3.2s, above the typical 800ms'],
    confidence: 'low' as const,
  },
  {
    id: 'h3',
    description: 'Browser extension interfered with form serialisation',
    evidence: [],
    confidence: 'low' as const,
  },
]

export const HighConfidence: StoryObj<typeof DiagnosisBlock> = {
  args: {
    diagnosisContent: baseDiagnosisContent,
    topHypothesis: highConfidenceHypothesis,
    allHypotheses: [highConfidenceHypothesis, ...secondaryHypotheses],
    audience: 'workspace',
  },
}

export const LowConfidence: StoryObj<typeof DiagnosisBlock> = {
  args: {
    diagnosisContent: {
      ...baseDiagnosisContent,
      inference: '',
      recommendations: [],
    },
    topHypothesis: lowConfidenceHypothesis,
    allHypotheses: [lowConfidenceHypothesis],
    audience: 'workspace',
  },
}

export const MediumConfidenceNoInference: StoryObj<typeof DiagnosisBlock> = {
  args: {
    diagnosisContent: {
      ...baseDiagnosisContent,
      inference: '',
    },
    topHypothesis: mediumConfidenceHypothesis,
    allHypotheses: [mediumConfidenceHypothesis],
    audience: 'workspace',
  },
}

export const SingleHypothesisExtension: StoryObj<typeof DiagnosisBlock> = {
  args: {
    diagnosisContent: {
      ...baseDiagnosisContent,
      recommendations: [],
    },
    topHypothesis: mediumConfidenceHypothesis,
    allHypotheses: [mediumConfidenceHypothesis],
    audience: 'extension',
  },
}

export const NoEvidence: StoryObj<typeof DiagnosisBlock> = {
  args: {
    diagnosisContent: {
      ...baseDiagnosisContent,
      recommendations: [],
    },
    topHypothesis: {
      id: 'h1',
      description:
        'User may have navigated away before form submission completed',
      evidence: [],
      confidence: 'low' as const,
    },
    allHypotheses: [
      {
        id: 'h1',
        description:
          'User may have navigated away before form submission completed',
        evidence: [],
        confidence: 'low' as const,
      },
    ],
    audience: 'extension',
  },
}
