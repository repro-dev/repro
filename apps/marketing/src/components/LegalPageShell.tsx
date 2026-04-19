'use client'

// jsxstyle requires a client boundary because it injects styles via React context.

import { Block, Col } from '@jsxstyle/react'
import { color, spacing, textStyles } from '@repro/design'
import React from 'react'

interface LegalPageShellProps {
  title: string
  lastUpdated: string
  children: React.ReactNode
}

export default function LegalPageShell({
  title,
  lastUpdated,
  children,
}: LegalPageShellProps) {
  const titleId = React.useId()

  return (
    <Col
      component="main"
      props={{ 'aria-labelledby': titleId }}
      minHeight="100vh"
      backgroundColor={color.bg.subtle}
      paddingV={spacing['4xl']}
      paddingH={spacing.xl}
    >
      <Col maxWidth="720px" width="100%" margin="0 auto" gap={spacing['3xl']}>
        {/* Page header */}
        <Col gap={spacing.md}>
          <Block
            component="h1"
            id={titleId}
            {...textStyles.display}
            color={color.text.default}
            margin="0"
          >
            {title}
          </Block>
          <Block
            component="p"
            {...textStyles.bodySmall}
            color={color.text.muted}
            margin="0"
          >
            Last updated: {lastUpdated}
          </Block>
        </Col>

        {/* Section content */}
        <Col gap={spacing['2xl']}>{children}</Col>
      </Col>
    </Col>
  )
}

interface LegalSectionProps {
  heading: string
  children: React.ReactNode
}

export function LegalSection({ heading, children }: LegalSectionProps) {
  return (
    <Col component="section" gap={spacing.xl}>
      <Block
        component="h2"
        {...textStyles.heading2}
        color={color.text.default}
        margin="0"
        paddingBottom={spacing.md}
        borderBottom={`1px solid ${color.border.default}`}
      >
        {heading}
      </Block>
      <Col gap={spacing.lg}>{children}</Col>
    </Col>
  )
}

interface LegalParagraphProps {
  children: React.ReactNode
}

export function LegalParagraph({ children }: LegalParagraphProps) {
  return (
    <Block
      component="p"
      {...textStyles.body}
      color={color.text.secondary}
      margin="0"
    >
      {children}
    </Block>
  )
}
