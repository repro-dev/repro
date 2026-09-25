import { Block, Col, Row } from '@jsxstyle/react'
import type { Meta, StoryObj } from '@storybook/react'
import React, { useState } from 'react'
import { expect, userEvent, within } from 'storybook/test'
import { color } from '../tokens/colors'
import { spacing } from '../tokens/spacing'
import { textStyles } from '../tokens/typography'
import { Tabs } from './index'

const meta: Meta<typeof Tabs> = {
  title: 'Components/Data Display/Tabs',
  component: Tabs,
  tags: ['autodocs', 'design-system'],
}

export default meta

type Story = StoryObj<typeof Tabs>

export const Default: Story = {
  render: () => (
    <Tabs defaultValue="overview">
      <Tabs.List aria-label="Product sections">
        <Tabs.Tab value="overview">Overview</Tabs.Tab>
        <Tabs.Tab value="features">Features</Tabs.Tab>
        <Tabs.Tab value="pricing">Pricing</Tabs.Tab>
      </Tabs.List>
      <Tabs.Panel value="overview">
        <Block {...textStyles.body} color={color.text.default}>
          Overview panel content. This tab is active by default.
        </Block>
      </Tabs.Panel>
      <Tabs.Panel value="features">
        <Block {...textStyles.body} color={color.text.default}>
          Features panel content.
        </Block>
      </Tabs.Panel>
      <Tabs.Panel value="pricing">
        <Block {...textStyles.body} color={color.text.default}>
          Pricing panel content.
        </Block>
      </Tabs.Panel>
    </Tabs>
  ),
}

export const Vertical: Story = {
  render: () => (
    <Row alignItems="flex-start">
      <Tabs defaultValue="general" orientation="vertical">
        <Tabs.List aria-label="Settings sections">
          <Tabs.Tab value="general">General</Tabs.Tab>
          <Tabs.Tab value="security">Security</Tabs.Tab>
          <Tabs.Tab value="notifications">Notifications</Tabs.Tab>
          <Tabs.Tab value="billing">Billing</Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel value="general">
          <Block {...textStyles.body} color={color.text.default}>
            General settings.
          </Block>
        </Tabs.Panel>
        <Tabs.Panel value="security">
          <Block {...textStyles.body} color={color.text.default}>
            Security settings.
          </Block>
        </Tabs.Panel>
        <Tabs.Panel value="notifications">
          <Block {...textStyles.body} color={color.text.default}>
            Notification preferences.
          </Block>
        </Tabs.Panel>
        <Tabs.Panel value="billing">
          <Block {...textStyles.body} color={color.text.default}>
            Billing information.
          </Block>
        </Tabs.Panel>
      </Tabs>
    </Row>
  ),
}

export const Controlled: Story = {
  render: () => {
    const [activeTab, setActiveTab] = useState('a')

    return (
      <Col gap={spacing['2xl']}>
        <Block {...textStyles.bodySmall} color={color.text.secondary}>
          Active tab: <strong>{activeTab}</strong>
        </Block>
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <Tabs.List aria-label="Controlled tabs">
            <Tabs.Tab value="a">Tab A</Tabs.Tab>
            <Tabs.Tab value="b">Tab B</Tabs.Tab>
            <Tabs.Tab value="c">Tab C</Tabs.Tab>
          </Tabs.List>
          <Tabs.Panel value="a">
            <Block {...textStyles.body} color={color.text.default}>
              Content for Tab A.
            </Block>
          </Tabs.Panel>
          <Tabs.Panel value="b">
            <Block {...textStyles.body} color={color.text.default}>
              Content for Tab B.
            </Block>
          </Tabs.Panel>
          <Tabs.Panel value="c">
            <Block {...textStyles.body} color={color.text.default}>
              Content for Tab C.
            </Block>
          </Tabs.Panel>
        </Tabs>
      </Col>
    )
  },
}

export const Disabled: Story = {
  render: () => (
    <Tabs defaultValue="active">
      <Tabs.List aria-label="Tabs with disabled">
        <Tabs.Tab value="active">Active</Tabs.Tab>
        <Tabs.Tab value="disabled" disabled>
          Disabled
        </Tabs.Tab>
        <Tabs.Tab value="another">Another</Tabs.Tab>
      </Tabs.List>
      <Tabs.Panel value="active">
        <Block {...textStyles.body} color={color.text.default}>
          This tab is active. The middle tab is disabled and cannot be selected.
        </Block>
      </Tabs.Panel>
      <Tabs.Panel value="disabled">
        <Block {...textStyles.body} color={color.text.default}>
          This panel is not reachable because the tab is disabled.
        </Block>
      </Tabs.Panel>
      <Tabs.Panel value="another">
        <Block {...textStyles.body} color={color.text.default}>
          Another tab's content.
        </Block>
      </Tabs.Panel>
    </Tabs>
  ),
}

export const ManyTabs: Story = {
  render: () => {
    const tabs = Array.from({ length: 10 }, (_, i) => ({
      value: `tab-${i + 1}`,
      label: `Tab ${i + 1}`,
    }))

    return (
      <Block maxWidth={600} overflow="hidden">
        <Tabs defaultValue="tab-1">
          <Block overflowX="auto">
            <Tabs.List aria-label="Many tabs">
              {tabs.map(t => (
                <Tabs.Tab key={t.value} value={t.value}>
                  {t.label}
                </Tabs.Tab>
              ))}
            </Tabs.List>
          </Block>
          {tabs.map(t => (
            <Tabs.Panel key={t.value} value={t.value}>
              <Block {...textStyles.body} color={color.text.default}>
                Content for {t.label}.
              </Block>
            </Tabs.Panel>
          ))}
        </Tabs>
      </Block>
    )
  },
}

export const WithRichContent: Story = {
  // Waiver (REP-1658 re-arm of flat-type-hierarchy): the rich-content demo
  // deliberately composes the panel's real vocabulary — tab labels, badges,
  // heading3 panel titles and body text — so the page's size set spans the
  // token ramp by design.
  parameters: {
    impeccable: {
      disable: ['flat-type-hierarchy'],
      reason:
        'rich-content demo composes heading3 panel titles, body copy and label-size contact text; deliberate token ramp',
    },
  },
  render: () => (
    <Tabs defaultValue="profile">
      <Tabs.List aria-label="Account settings">
        <Tabs.Tab value="profile">Profile</Tabs.Tab>
        <Tabs.Tab value="preferences">Preferences</Tabs.Tab>
        <Tabs.Tab value="advanced">Advanced</Tabs.Tab>
      </Tabs.List>
      <Tabs.Panel value="profile">
        <Col gap={spacing.lg}>
          <Block {...textStyles.heading3} color={color.text.default}>
            Profile Information
          </Block>
          <Block {...textStyles.body} color={color.text.secondary}>
            Manage your name, email, and profile picture.
          </Block>
          <Row gap={spacing.md}>
            <Block
              width={64}
              height={64}
              borderRadius="50%"
              backgroundColor={color.bg.muted}
            />
            <Col gap={spacing.xs}>
              <Block {...textStyles.label} color={color.text.default}>
                Gary Chambers
              </Block>
              <Block {...textStyles.bodySmall} color={color.text.secondary}>
                gary@example.com
              </Block>
            </Col>
          </Row>
        </Col>
      </Tabs.Panel>
      <Tabs.Panel value="preferences">
        <Col gap={spacing.lg}>
          <Block {...textStyles.heading3} color={color.text.default}>
            Preferences
          </Block>
          <Block {...textStyles.body} color={color.text.secondary}>
            Configure your workspace preferences.
          </Block>
        </Col>
      </Tabs.Panel>
      <Tabs.Panel value="advanced">
        <Col gap={spacing.lg}>
          <Block {...textStyles.heading3} color={color.text.default}>
            Advanced Settings
          </Block>
          <Block {...textStyles.body} color={color.text.secondary}>
            Danger zone and advanced configuration options.
          </Block>
        </Col>
      </Tabs.Panel>
    </Tabs>
  ),
}

export const KeyboardNavigationTest: Story = {
  render: () => {
    const [active, setActive] = useState('tab-a')
    return (
      <Col gap={spacing.lg}>
        <Tabs value={active} onValueChange={setActive}>
          <Tabs.List aria-label="Keyboard nav test">
            <Tabs.Tab value="tab-a">Tab A</Tabs.Tab>
            <Tabs.Tab value="tab-b">Tab B</Tabs.Tab>
            <Tabs.Tab value="tab-c">Tab C</Tabs.Tab>
          </Tabs.List>
          <Tabs.Panel value="tab-a">Panel A</Tabs.Panel>
          <Tabs.Panel value="tab-b">Panel B</Tabs.Panel>
          <Tabs.Panel value="tab-c">Panel C</Tabs.Panel>
        </Tabs>
        <Block {...textStyles.caption} color={color.text.muted}>
          Active: {active}
        </Block>
      </Col>
    )
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const tabs = canvas.getAllByRole('tab')

    await expect(tabs).toHaveLength(3)
    await expect(tabs[0]).toHaveAttribute('aria-selected', 'true')
    await expect(tabs[1]).toHaveAttribute('aria-selected', 'false')

    await tabs[0]!.focus()
    await userEvent.keyboard('{ArrowRight}')
    await expect(tabs[1]).toHaveFocus()
    await expect(tabs[1]).toHaveAttribute('aria-selected', 'true')

    await userEvent.keyboard('{ArrowRight}')
    await expect(tabs[2]).toHaveFocus()

    await userEvent.keyboard('{ArrowRight}')
    await expect(tabs[0]).toHaveFocus()

    await userEvent.keyboard('{End}')
    await expect(tabs[2]).toHaveFocus()

    await userEvent.keyboard('{Home}')
    await expect(tabs[0]).toHaveFocus()
  },
}
