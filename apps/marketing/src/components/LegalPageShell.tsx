'use client'

// jsxstyle requires a client boundary for style injection.
// Legal pages are static content, so this client component is a thin
// presentation shell wrapping server-rendered page routes.

import { Block, Col } from '@jsxstyle/react'
import { color, spacing, textStyles } from '@repro/design'
// Explicit React import required for tsx test runner (jsx: preserve mode
// doesn't auto-inject the automatic JSX runtime outside of Next.js).
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
  return (
    <Col
      minHeight="100vh"
      backgroundColor={color.bg.subtle}
      paddingV={spacing['4xl']}
      paddingH={spacing.xl}
    >
      <Col maxWidth="768px" width="100%" marginH="auto" gap={spacing['3xl']}>
        {/* Page header */}
        <Col gap={spacing.md}>
          <Block
            component="h1"
            {...textStyles.display}
            color={color.text.default}
          >
            {title}
          </Block>
          <Block
            {...textStyles.bodySmall}
            color={color.text.muted}
          >{`Last updated: ${lastUpdated}`}</Block>
        </Col>

        {/* Page content */}
        <Col gap={spacing['2xl']}>{children}</Col>
      </Col>
    </Col>
  )
}

// ---------------------------------------------------------------------------
// Section components
// ---------------------------------------------------------------------------

interface LegalSectionProps {
  heading: string
  children: React.ReactNode
}

export function LegalSection({ heading, children }: LegalSectionProps) {
  return (
    <Col gap={spacing.lg} component="section">
      <Block component="h2" {...textStyles.heading2} color={color.text.default}>
        {heading}
      </Block>
      <Col gap={spacing.md}>{children}</Col>
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
      lineHeight={1.7}
    >
      {children}
    </Block>
  )
}
