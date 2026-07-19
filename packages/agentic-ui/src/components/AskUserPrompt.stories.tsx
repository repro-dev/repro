import { Block } from '@jsxstyle/react'
import type { Meta, StoryObj } from '@storybook/react'
import React from 'react'
import { AskUserPrompt } from './AskUserPrompt'

const meta: Meta<typeof AskUserPrompt> = {
  title: 'Agentic/AskUserPrompt',
  component: AskUserPrompt,
  tags: ['experimental'],
  decorators: [
    Story => (
      <Block inlineSize={400} padding={16}>
        <Story />
      </Block>
    ),
  ],
}

export default meta

export const SingleSelect: StoryObj<typeof AskUserPrompt> = {
  args: {
    toolCallId: 'tc1',
    request: {
      prompt: 'Which browser are you testing in?',
      choices: [
        { label: 'Chrome', value: 'chrome' },
        { label: 'Firefox', value: 'firefox' },
        { label: 'Safari', value: 'safari' },
        { label: 'Edge', value: 'edge' },
      ],
      multiple: false,
    },
    onSubmit: () => {},
  },
}

export const MultiSelect: StoryObj<typeof AskUserPrompt> = {
  args: {
    toolCallId: 'tc2',
    request: {
      prompt: 'Which issues did you observe? (Select all that apply)',
      choices: [
        { label: 'Page crashed', value: 'crash' },
        { label: 'Slow loading', value: 'slow' },
        { label: 'Incorrect data', value: 'wrong-data' },
        { label: 'UI layout broken', value: 'layout' },
      ],
      multiple: true,
    },
    onSubmit: () => {},
  },
}

export const Freeform: StoryObj<typeof AskUserPrompt> = {
  args: {
    toolCallId: 'tc3',
    request: {
      prompt: 'Can you describe what happened in more detail?',
      allowFreeform: true,
    },
    onSubmit: () => {},
  },
}

export const SingleSelectWithFreeform: StoryObj<typeof AskUserPrompt> = {
  args: {
    toolCallId: 'tc4',
    request: {
      prompt: 'What type of error did you see?',
      choices: [
        { label: 'Console error', value: 'console' },
        { label: 'Network failure', value: 'network' },
        { label: 'Blank page', value: 'blank' },
        { label: 'Unexpected redirect', value: 'redirect' },
      ],
      allowFreeform: true,
    },
    onSubmit: () => {},
  },
}

export const MultiSelectWithFreeform: StoryObj<typeof AskUserPrompt> = {
  args: {
    toolCallId: 'tc5',
    request: {
      prompt: 'Which steps did you complete?',
      choices: [
        { label: 'Logged in', value: 'login' },
        { label: 'Opened dashboard', value: 'dashboard' },
        { label: 'Clicked settings', value: 'settings' },
        { label: 'Submitted form', value: 'form' },
      ],
      multiple: true,
      allowFreeform: true,
    },
    onSubmit: () => {},
  },
}

export const PromptOnly: StoryObj<typeof AskUserPrompt> = {
  args: {
    toolCallId: 'tc6',
    request: {
      prompt:
        'Please check the console output and confirm you can see the error message logged there.',
    },
    onSubmit: () => {},
  },
}

export const WithDescriptions: StoryObj<typeof AskUserPrompt> = {
  args: {
    toolCallId: 'tc7',
    request: {
      prompt: 'Which recording do you want to investigate?',
      choices: [
        {
          label: 'Session #1243',
          value: '1243',
          description: '42 s, 3 errors, recorded 2h ago',
        },
        {
          label: 'Session #1201',
          value: '1201',
          description: '18 s, no errors, recorded 5h ago',
        },
        {
          label: 'Session #1187',
          value: '1187',
          description: '67 s, 1 error, recorded yesterday',
        },
      ],
    },
    onSubmit: () => {},
  },
}

export const Disabled: StoryObj<typeof AskUserPrompt> = {
  args: {
    toolCallId: 'tc8',
    request: {
      prompt: 'Which browser are you testing in?',
      choices: [
        { label: 'Chrome', value: 'chrome' },
        { label: 'Firefox', value: 'firefox' },
      ],
    },
    onSubmit: () => {},
    disabled: true,
  },
}
