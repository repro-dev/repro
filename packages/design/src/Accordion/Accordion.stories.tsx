import { Block } from '@jsxstyle/react'
import type { Meta, StoryObj } from '@storybook/react'
import React, { useState } from 'react'
import { spacing } from '../tokens/spacing'
import { Accordion, AccordionValue } from './index'

const meta: Meta<typeof Accordion> = {
  title: 'Components/Data Display/Accordion',
  component: Accordion,
  tags: ['autodocs', 'design-system'],
}

export default meta

type Story = StoryObj<typeof Accordion>

function ProductFaq() {
  return (
    <>
      <Accordion.Item value="capture">
        <Accordion.Trigger>What can a Repro session capture?</Accordion.Trigger>
        <Accordion.Content>
          Sessions include DOM snapshots, user interactions, console entries,
          request metadata, and timing context so engineers can inspect a
          replay.
        </Accordion.Content>
      </Accordion.Item>
      <Accordion.Item value="privacy">
        <Accordion.Trigger>How is sensitive input handled?</Accordion.Trigger>
        <Accordion.Content>
          Teams can mask fields and redact selectors before data is persisted,
          keeping private customer information out of debugging artifacts.
        </Accordion.Content>
      </Accordion.Item>
      <Accordion.Item value="sharing">
        <Accordion.Trigger>Who can view a recording?</Accordion.Trigger>
        <Accordion.Content>
          Workspace permissions control who can open recordings, share links,
          and collaborate on debugging notes.
        </Accordion.Content>
      </Accordion.Item>
    </>
  )
}

export const SingleExpand: Story = {
  // Waiver (REP-1656): the accordion root is the component's intended
  // edge-to-edge anatomy — rows carry their own padding; the un-padded root
  // trips cramped-padding structurally.
  parameters: {
    impeccable: {
      disable: ['cramped-padding'],
      reason: 'accordion root is edge-to-edge by design; rows carry padding',
    },
  },
  render: () => (
    <Block maxWidth={640} padding={spacing.xl}>
      <Accordion defaultValue="capture">
        <ProductFaq />
      </Accordion>
    </Block>
  ),
}

export const MultiExpand: Story = {
  parameters: {
    impeccable: {
      disable: ['cramped-padding'],
      reason: 'accordion root is edge-to-edge by design; rows carry padding',
    },
  },
  render: () => (
    <Block maxWidth={640} padding={spacing.xl}>
      <Accordion mode="multiple" defaultValue={['capture', 'privacy']}>
        <ProductFaq />
      </Accordion>
    </Block>
  ),
}

export const Controlled: Story = {
  parameters: {
    impeccable: {
      disable: ['cramped-padding'],
      reason: 'accordion root is edge-to-edge by design; rows carry padding',
    },
  },
  render: () => {
    const [value, setValue] = useState<AccordionValue>('privacy')

    return (
      <Block maxWidth={640} padding={spacing.xl}>
        <Accordion value={value} onValueChange={setValue}>
          <ProductFaq />
        </Accordion>
      </Block>
    )
  },
}

export const Disabled: Story = {
  parameters: {
    impeccable: {
      disable: ['cramped-padding'],
      reason: 'accordion root is edge-to-edge by design; rows carry padding',
    },
  },
  render: () => (
    <Block maxWidth={640} padding={spacing.xl}>
      <Accordion defaultValue="capture">
        <ProductFaq />
        <Accordion.Item value="enterprise" disabled>
          <Accordion.Trigger>Enterprise retention options</Accordion.Trigger>
          <Accordion.Content>
            Retention controls are configured by workspace administrators.
          </Accordion.Content>
        </Accordion.Item>
      </Accordion>
    </Block>
  ),
}
