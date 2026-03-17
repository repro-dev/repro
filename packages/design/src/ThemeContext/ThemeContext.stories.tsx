import { Block, Col, Row } from '@jsxstyle/react'
import type { Meta, StoryObj } from '@storybook/react'
import React from 'react'
import { Button } from '../Button'
import { Card } from '../Card'
import { colors } from '../tokens/colors'
import { spacing } from '../tokens/spacing'
import { textStyles } from '../tokens/typography'
import {
  defaultTheme,
  ThemeProvider,
  useTheme,
  type ThemeDefinition,
} from './ThemeContext'

const meta: Meta<typeof ThemeProvider> = {
  title: 'Providers/ThemeProvider',
  component: ThemeProvider,
  tags: ['autodocs', 'design-system'],
  parameters: {
    layout: 'fullscreen',
  },
}

export default meta

type Story = StoryObj<typeof ThemeProvider>

function TokenSwatch({ label, value }: { label: string; value: string }) {
  return (
    <Row alignItems="center" gap={spacing.sm}>
      <Block
        width={24}
        height={24}
        borderRadius={4}
        backgroundColor={value}
        border="1px solid rgba(0,0,0,0.1)"
        flexShrink={0}
      />
      <Col>
        <Block {...textStyles.caption} fontWeight={600}>
          {label}
        </Block>
        <Block {...textStyles.caption} opacity={0.6}>
          {value}
        </Block>
      </Col>
    </Row>
  )
}

function ThemeDemo({ title }: { title: string }) {
  const theme = useTheme()
  return (
    <Card>
      <Col gap={spacing.lg} padding={spacing.lg}>
        <Block {...textStyles.heading3}>{title}</Block>

        <Col gap={spacing.sm}>
          <Block {...textStyles.label}>Primary</Block>
          <Row gap={spacing.lg}>
            <TokenSwatch label="primary" value={theme.color.primary} />
            <TokenSwatch
              label="primaryHover"
              value={theme.color.primaryHover}
            />
            <TokenSwatch
              label="primarySubtle"
              value={theme.color.primarySubtle}
            />
          </Row>
        </Col>

        <Col gap={spacing.sm}>
          <Block {...textStyles.label}>Backgrounds</Block>
          <Row gap={spacing.lg}>
            <TokenSwatch label="bg.surface" value={theme.color.bg.surface} />
            <TokenSwatch label="bg.subtle" value={theme.color.bg.subtle} />
            <TokenSwatch label="bg.emphasis" value={theme.color.bg.emphasis} />
          </Row>
        </Col>

        <Row gap={spacing.sm}>
          <Button variant="contained" size="small">
            Primary Action
          </Button>
          <Button variant="outlined" size="small">
            Secondary
          </Button>
        </Row>
      </Col>
    </Card>
  )
}

const adminTheme: ThemeDefinition = {
  color: {
    primary: colors.slate['700'],
    primaryHover: colors.slate['800'],
    primarySubtle: colors.slate['100'],
    primarySubtleHover: colors.slate['200'],

    text: {
      default: colors.slate['900'],
      secondary: colors.slate['700'],
      muted: colors.slate['500'],
      inverse: colors.white,
    },

    bg: {
      surface: colors.white,
      subtle: colors.slate['50'],
      hover: colors.slate['100'],
      muted: colors.slate['200'],
      emphasis: colors.slate['800'],
      overlay: 'rgba(0,0,0,0.5)',
    },

    border: {
      default: colors.slate['200'],
      strong: colors.slate['300'],
      emphasis: colors.slate['500'],
      focus: colors.slate['500'],
    },

    danger: colors.rose['700'],
    dangerHover: colors.rose['800'],
    dangerSubtle: colors.rose['100'],
    dangerBorder: colors.rose['500'],
    dangerBorderSubtle: colors.rose['300'],
    dangerFg: colors.rose['900'],

    success: colors.green['700'],
    successHover: colors.green['800'],
    successSubtle: colors.green['100'],
    successBorder: colors.green['600'],
    successBorderSubtle: colors.green['300'],
    successFg: colors.green['900'],

    warning: colors.amber['700'],
    warningHover: colors.amber['800'],
    warningEmphasis: colors.amber['400'],
    warningEmphasisHover: colors.amber['500'],
    warningSubtle: colors.amber['100'],
    warningBorder: colors.amber['600'],
    warningBorderSubtle: colors.amber['300'],
    warningFg: colors.amber['900'],

    info: colors.blue['700'],
    infoSubtle: colors.blue['100'],
    infoBorder: colors.blue['500'],
    infoBorderSubtle: colors.blue['300'],
    infoFg: colors.blue['900'],

    neutral: colors.slate['700'],
    neutralHover: colors.slate['600'],
    neutralBorder: colors.slate['500'],
    neutralBorderSubtle: colors.slate['300'],
  },
}

const darkTheme: ThemeDefinition = {
  color: {
    primary: colors.blue['400'],
    primaryHover: colors.blue['300'],
    primarySubtle: colors.blue['950'],
    primarySubtleHover: colors.blue['900'],

    text: {
      default: colors.slate['100'],
      secondary: colors.slate['300'],
      muted: colors.slate['500'],
      inverse: colors.slate['900'],
    },

    bg: {
      surface: colors.slate['900'],
      subtle: colors.slate['800'],
      hover: colors.slate['700'],
      muted: colors.slate['600'],
      emphasis: colors.slate['950'],
      overlay: 'rgba(0,0,0,0.7)',
    },

    border: {
      default: colors.slate['700'],
      strong: colors.slate['600'],
      emphasis: colors.slate['400'],
      focus: colors.blue['400'],
    },

    danger: colors.rose['400'],
    dangerHover: colors.rose['300'],
    dangerSubtle: colors.rose['950'],
    dangerBorder: colors.rose['500'],
    dangerBorderSubtle: colors.rose['800'],
    dangerFg: colors.rose['200'],

    success: colors.green['400'],
    successHover: colors.green['300'],
    successSubtle: colors.green['950'],
    successBorder: colors.green['500'],
    successBorderSubtle: colors.green['800'],
    successFg: colors.green['200'],

    warning: colors.amber['400'],
    warningHover: colors.amber['300'],
    warningEmphasis: colors.amber['500'],
    warningEmphasisHover: colors.amber['400'],
    warningSubtle: colors.amber['950'],
    warningBorder: colors.amber['500'],
    warningBorderSubtle: colors.amber['800'],
    warningFg: colors.amber['200'],

    info: colors.blue['400'],
    infoSubtle: colors.blue['950'],
    infoBorder: colors.blue['500'],
    infoBorderSubtle: colors.blue['800'],
    infoFg: colors.blue['200'],

    neutral: colors.slate['400'],
    neutralHover: colors.slate['300'],
    neutralBorder: colors.slate['500'],
    neutralBorderSubtle: colors.slate['700'],
  },
}

export const Default: Story = {
  render: () => (
    <Block padding={spacing.xl}>
      <ThemeProvider theme={defaultTheme}>
        <ThemeDemo title="Default Theme" />
      </ThemeProvider>
    </Block>
  ),
}

export const AdminTheme: Story = {
  render: () => (
    <Block padding={spacing.xl}>
      <ThemeProvider theme={adminTheme}>
        <ThemeDemo title="Admin Theme" />
      </ThemeProvider>
    </Block>
  ),
}

export const DarkTheme: Story = {
  render: () => (
    <Block padding={spacing.xl} backgroundColor={colors.slate['950']}>
      <ThemeProvider theme={darkTheme}>
        <ThemeDemo title="Dark Theme" />
      </ThemeProvider>
    </Block>
  ),
}

export const SideBySide: Story = {
  render: () => (
    <Block padding={spacing.xl}>
      <Col gap={spacing.lg}>
        <Block {...textStyles.heading2}>Theme Comparison</Block>
        <Row gap={spacing.lg}>
          <Block flex={1}>
            <ThemeProvider theme={defaultTheme}>
              <ThemeDemo title="Default" />
            </ThemeProvider>
          </Block>
          <Block flex={1}>
            <ThemeProvider theme={adminTheme}>
              <ThemeDemo title="Admin" />
            </ThemeProvider>
          </Block>
          <Block flex={1} backgroundColor={colors.slate['950']} borderRadius={8}>
            <ThemeProvider theme={darkTheme}>
              <ThemeDemo title="Dark" />
            </ThemeProvider>
          </Block>
        </Row>
      </Col>
    </Block>
  ),
}
