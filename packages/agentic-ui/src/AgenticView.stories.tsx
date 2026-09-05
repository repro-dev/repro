import { Block } from '@jsxstyle/react'
import {
  AgenticError,
  AgenticState,
  Entry,
  Hypothesis,
  Loading,
  PendingAskUserInteraction,
  RecordingMeta,
} from '@repro/agentic'
import { atom } from '@repro/atom'
import { Card } from '@repro/design'
import type { Decorator, Meta, StoryObj } from '@storybook/react'
import React from 'react'
import { AgenticView } from './AgenticView'
import { AgenticStateContext } from './context'

const meta: Meta = {
  title: 'Agentic/AgenticView',
  component: AgenticView,
  tags: ['experimental'],
  decorators: [
    Story => (
      <Block
        blockSize={640}
        inlineSize={420}
        overflow="clip"
        overflowClipMargin={16}
      >
        <Card height="100%">
          <Story />
        </Card>
      </Block>
    ),
  ],
}

// Impeccable rendered-HTML gate waiver (REP-1656 convention, triaged under
// REP-1657): the detector scans the static-HTML render, where AgenticView's
// app-shell root (full-bleed container whose children carry their own
// insets) reads as cramped padding, and the input section's deliberate
// raise/expand animation (AgenticInputSection animates margin/padding
// alongside transform) reads as a layout-property animation. Both are
// intentional; a transform-only raise rework is a design follow-up.
const impeccableWaiver = {
  parameters: {
    impeccable: {
      disable: ['layout-transition', 'cramped-padding'],
      reason:
        'AgenticView app-shell: structural frame with inset children; input-section raise animates margin/padding by design',
    },
  },
} as const

export default meta

function withState(state: AgenticState): Decorator {
  return Story => (
    <AgenticStateContext.Provider value={state}>
      <Story />
    </AgenticStateContext.Provider>
  )
}

function makeState(
  entries: Array<Entry>,
  loading: Loading,
  error: AgenticError | null = null,
  truncatedBeforeId: string | null = null,
  stage: 'idle' | 'orient' | 'hypotheses' | 'evidence' | 'conclusion' = 'idle',
  hypotheses: Array<Hypothesis> = [],
  pendingInteraction: PendingAskUserInteraction | null = null
): AgenticState {
  return {
    $entries: atom<Array<Entry>>(entries),
    $loading: atom<Loading>(loading),
    $error: atom<AgenticError | null>(error),
    $wasCancelled: atom<boolean>(false),
    $stage: atom(stage),
    $hypotheses: atom(hypotheses),
    $pendingInteraction: atom<PendingAskUserInteraction | null>(
      pendingInteraction
    ),
    $truncatedBefore: atom<string | null>(truncatedBeforeId),
    cancel: () => {},
    destroy: () => {},
    query: () => {},
    submitAskUserAnswer: () => {},
    reset: () => {},
  }
}

export const Default: StoryObj = {}

export const Reasoning: StoryObj = {
  ...impeccableWaiver,
  decorators: [
    withState(
      makeState(
        [
          {
            id: '1',
            timestamp: new Date(),
            role: 'user',
            content:
              'What is the meaning of life, the universe and everything?',
          },
          {
            id: '2',
            timestamp: new Date(),
            role: 'assistant',
            content:
              'The answer to the meaning of life, the universe and everything is widely agreed to be the number **42**.',
            toolCalls: [],
          },
          {
            id: '3',
            timestamp: new Date(),
            role: 'user',
            content:
              'What is the origin of this? This is a particularly long question that wraps on to multiple lines.\n\nIt also contains line breaks and **formatted** _text_.',
          },
          {
            id: '4',
            timestamp: new Date(),
            role: 'assistant',
            content: '',
            toolCalls: [],
          },
        ],
        'reasoning'
      )
    ),
  ],
}

export const Responding: StoryObj = {
  ...impeccableWaiver,
  decorators: [
    withState(
      makeState(
        [
          {
            id: '1',
            timestamp: new Date(),
            role: 'user',
            content:
              'What is the meaning of life, the universe and everything?',
          },
          {
            id: '2',
            timestamp: new Date(),
            role: 'assistant',
            content:
              'The answer to the meaning of life, the universe and everything is widely agreed to be the number **42**.',
            toolCalls: [],
          },
          {
            id: '3',
            timestamp: new Date(),
            role: 'user',
            content:
              'What is the origin of this? This is a particularly long question that wraps on to multiple lines.\n\nIt also contains line breaks and **formatted** _text_.',
          },
          {
            id: '4',
            timestamp: new Date(),
            role: 'assistant',
            content: `Lorem ipsum dolor sit amet, consectetur adipiscing elit. Cras elementum pharetra odio ut interdum. Curabitur quis nunc vulputate, ornare eros ac, rhoncus libero. Phasellus eget mi ut mi volutpat dapibus nec id lacus. Curabitur volutpat dui libero, sed rhoncus dolor ullamcorper non. Pellentesque vehicula tincidunt lorem eu viverra. Vivamus ac massa orci. Suspendisse nisl leo, vestibulum et venenatis vitae, sodales sit amet arcu. Lorem ipsum dolor sit amet, consectetur adipiscing elit. Interdum et malesuada fames ac ante ipsum primis in faucibus. Suspendisse pretium rhoncus velit. Maecenas ullamcorper ex ultricies urna ultricies ultrices. Sed viverra sem id massa aliquam laoreet. Etiam sed maximus lectus, sit amet suscipit urna. Ut feugiat et dui ac vulputate. Donec imperdiet non ante in finibus. Cras rhoncus ullamcorper dolor, ut consectetur dolor.

Integer tempus, risus sed commodo tincidunt, urna tortor scelerisque enim, vel mattis lectus sapien ac elit. Sed condimentum ultricies rhoncus. Integer condimentum ut metus quis sodales. Integer est lorem, eleifend sodales metus eu, rhoncus volutpat ex. Donec sed feugiat nisi. Etiam quis lectus in felis congue accumsan vitae ut nulla. Praesent scelerisque neque quis leo malesuada congue. Cras malesuada, ante a bibendum accumsan, tellus metus tristique risus, venenatis iaculis dolor nunc in elit. Proin vel augue urna faucibus semper eget vel orci. In aliquet ut nisi ut venenatis. Sed at euismod dui. Integer fermentum placerat viverra. Suspendisse varius dolor at nisi fermentum tempus. Vivamus vitae tortor dictum, convallis nunc ac, auctor est.

Sed vitae orci vulputate eros maximus scelerisque. Fusce id nisi odio. Proin sollicitudin luctus elit, a condimentum eros accumsan sodales. Vestibulum vitae neque diam. Morbi fermentum id felis vel luctus. Integer nibh orci, commodo sit amet porta auctor, consequat vulputate felis. Quisque a dui augue. Fusce ac consequat est, a maximus massa.`,
            toolCalls: [],
          },
        ],
        'responding'
      )
    ),
  ],
}

export const WithToolCalls: StoryObj = {
  ...impeccableWaiver,
  decorators: [
    withState(
      makeState(
        [
          {
            id: '1',
            timestamp: new Date(),
            role: 'user',
            content:
              'How long is the recording and are there any console errors?',
          },
          {
            id: '2',
            timestamp: new Date(),
            role: 'assistant',
            content: '',
            toolCalls: [
              {
                id: 'tc1',
                index: 0,
                function: { name: 'getRecordingDuration', arguments: '{}' },
              },
              {
                id: 'tc2',
                index: 1,
                function: { name: 'getConsoleMessages', arguments: '{}' },
              },
            ],
          },
          {
            id: '3',
            timestamp: new Date(),
            role: 'tool',
            content: JSON.stringify({ duration: 12.5 }),
            tool_call_id: 'tc1',
          },
          {
            id: '4',
            timestamp: new Date(),
            role: 'tool',
            content: JSON.stringify({
              messages: [
                {
                  level: 'error',
                  text: 'Uncaught TypeError: Cannot read property',
                },
                { level: 'warn', text: 'Deprecated API usage' },
                { level: 'error', text: 'Network request failed' },
              ],
            }),
            tool_call_id: 'tc2',
          },
          {
            id: '5',
            timestamp: new Date(),
            role: 'assistant',
            content:
              'The recording is **12.5 seconds** long. I found **3 console messages** including 2 errors: a `TypeError` and a failed network request.',
            toolCalls: [],
          },
        ],
        'none'
      )
    ),
  ],
}

export const ToolExecuting: StoryObj = {
  ...impeccableWaiver,
  decorators: [
    withState(
      makeState(
        [
          {
            id: '1',
            timestamp: new Date(),
            role: 'user',
            content: 'What network requests were made during the session?',
          },
          {
            id: '2',
            timestamp: new Date(),
            role: 'assistant',
            content: '',
            toolCalls: [
              {
                id: 'tc1',
                index: 0,
                function: { name: 'getNetworkRequests', arguments: '{}' },
              },
            ],
          },
        ],
        'tool-executing'
      )
    ),
  ],
}

export const AskUserPrompting: StoryObj = {
  ...impeccableWaiver,
  decorators: [
    withState(
      makeState(
        [
          {
            id: '1',
            timestamp: new Date(),
            role: 'user',
            content:
              'Why did the checkout button stop working after the discount was applied?',
          },
          {
            id: '2',
            timestamp: new Date(),
            role: 'assistant',
            content:
              'I found console errors around the time of the discount application and a failed POST to `/api/checkout`. To narrow this down further, I have a question.',
            toolCalls: [
              {
                id: 'tc1',
                index: 0,
                function: {
                  name: 'askUser',
                  arguments: JSON.stringify({
                    prompt: 'Which discount code did you apply?',
                    choices: [
                      { label: 'SUMMER20', value: 'summer20' },
                      { label: 'WELCOME10', value: 'welcome10' },
                      { label: 'FREESHIP', value: 'freeship' },
                      { label: 'FLASH50', value: 'flash50' },
                      { label: "Other (I'll specify)", value: 'other' },
                    ],
                  }),
                },
              },
            ],
          },
        ],
        'tool-executing',
        null,
        null,
        'evidence',
        [],
        {
          id: 'pi1',
          toolCallId: 'tc1',
          createdAt: new Date(),
          request: {
            prompt: 'Which discount code did you apply?',
            choices: [
              { label: 'SUMMER20', value: 'summer20' },
              { label: 'WELCOME10', value: 'welcome10' },
              { label: 'FREESHIP', value: 'freeship' },
              { label: 'FLASH50', value: 'flash50' },
              { label: "Other (I'll specify)", value: 'other' },
            ],
            allowFreeform: true,
          },
        }
      )
    ),
  ],
}

export const WithError: StoryObj = {
  ...impeccableWaiver,
  decorators: [
    withState(
      makeState(
        [
          {
            id: '1',
            timestamp: new Date(),
            role: 'user',
            content: 'What is causing this bug?',
          },
        ],
        'none',
        {
          message:
            'The agent encountered an unexpected error. Please try again.',
          retryable: true,
          attempt: 1,
        }
      )
    ),
  ],
}

// A minimal 1×1 transparent PNG encoded as a data URL, used in place of a real screenshot in stories.
const PLACEHOLDER_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='

export const WithScreenshotResult: StoryObj = {
  ...impeccableWaiver,
  decorators: [
    withState(
      makeState(
        [
          {
            id: '1',
            timestamp: new Date(),
            role: 'user',
            content: 'Take a screenshot of the current state.',
          },
          {
            id: '2',
            timestamp: new Date(),
            role: 'assistant',
            content: '',
            toolCalls: [
              {
                id: 'tc1',
                index: 0,
                function: { name: 'captureScreenshot', arguments: '{}' },
              },
            ],
          },
          {
            id: '3',
            timestamp: new Date(),
            role: 'tool',
            content: JSON.stringify({
              dataUrl: PLACEHOLDER_DATA_URL,
              timestampMs: 1234,
              _tokenEstimate: 100,
            }),
            tool_call_id: 'tc1',
          },
          {
            id: '4',
            timestamp: new Date(),
            role: 'assistant',
            content: 'Here is the screenshot of the current state.',
            toolCalls: [],
          },
        ],
        'none'
      )
    ),
  ],
}

export const WithTruncation: StoryObj = {
  ...impeccableWaiver,
  decorators: [
    withState(
      makeState(
        [
          {
            id: '1',
            timestamp: new Date(),
            role: 'user',
            content: 'What is the meaning of life?',
          },
          {
            id: '2',
            timestamp: new Date(),
            role: 'assistant',
            content: 'The answer is 42.',
            toolCalls: [],
          },
          {
            id: '3',
            timestamp: new Date(),
            role: 'user',
            content: 'Can you explain further?',
          },
          {
            id: '4',
            timestamp: new Date(),
            role: 'assistant',
            content:
              "It comes from the Hitchhiker's Guide to the Galaxy by Douglas Adams.",
            toolCalls: [],
          },
        ],
        'none',
        null,
        // Truncation indicator before entry "3" — earlier messages were dropped
        '3'
      )
    ),
  ],
}

export const WithHypotheses: StoryObj = {
  ...impeccableWaiver,
  decorators: [
    withState(
      makeState(
        [
          {
            id: '1',
            timestamp: new Date(),
            role: 'user',
            content: 'Why is the login button not working?',
          },
          {
            id: '2',
            timestamp: new Date(),
            role: 'assistant',
            content:
              "I found several issues during the investigation. Here's what I discovered.",
            toolCalls: [],
          },
        ],
        'none',
        null,
        null,
        'conclusion',
        [
          {
            id: 'h1',
            description: 'Network request to auth endpoint is failing silently',
            evidence: [
              'Network request to /api/auth/login returned 500 at 3.2s',
              'No retry logic detected in the XHR handler',
            ],
            confidence: 'high',
          },
          {
            id: 'h2',
            description:
              'Form validation prevents submission without visual feedback',
            evidence: [
              'Button click at 2.1s did not trigger any network activity',
              'No validation error messages visible in DOM snapshots',
            ],
            confidence: 'medium',
          },
          {
            id: 'h3',
            description: 'Third-party script blocking main thread',
            evidence: ['Long task detected at 1.5s from analytics.js'],
            confidence: 'low',
          },
        ]
      )
    ),
  ],
}

const recordingMeta: RecordingMeta = {
  browser: 'Chrome 120',
  durationMs: 45200,
  recordingUrl: 'https://app.repro.dev/r/abc123',
}

export const WithRecordingMeta: StoryObj = {
  ...impeccableWaiver,
  args: {
    recordingMeta,
  },
  decorators: [
    withState(
      makeState(
        [
          {
            id: '1',
            timestamp: new Date(),
            role: 'user',
            content: 'Why is the login button not working?',
          },
          {
            id: '2',
            timestamp: new Date(),
            role: 'assistant',
            content:
              "I found several issues during the investigation. Here's what I discovered.",
            toolCalls: [],
          },
        ],
        'none',
        null,
        null,
        'conclusion',
        [
          {
            id: 'h1',
            description: 'Network request to auth endpoint is failing silently',
            evidence: [
              'Network request to /api/auth/login returned 500 at 3.2s',
              'No retry logic detected in the XHR handler',
            ],
            confidence: 'high',
          },
        ]
      )
    ),
  ],
}
