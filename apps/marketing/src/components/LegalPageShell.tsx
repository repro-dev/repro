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
  return (
    <Col
      component="main"
      maxWidth="720px"
      width="100%"
      marginH="auto"
      paddingV={spacing['3xl']}
      paddingH={spacing.xl}
      gap={spacing['3xl']}
    >
      <Col gap={spacing.md}>
        <Block
          component="h1"
          {...textStyles.heading1}
          color={color.text.default}
        >
          {title}
        </Block>
        <Block component="p" {...textStyles.caption} color={color.text.muted}>
          Last updated: {lastUpdated}
        </Block>
      </Col>
      {children}
    </Col>
  )
}

interface LegalSectionProps {
  heading: string
  children: React.ReactNode
}

export function LegalSection({ heading, children }: LegalSectionProps) {
  return (
    <Col component="section" gap={spacing.lg}>
      <Block component="h2" {...textStyles.heading2} color={color.text.default}>
        {heading}
      </Block>
      {children}
    </Col>
  )
}

interface LegalParagraphProps {
  children: React.ReactNode
}

export function LegalParagraph({ children }: LegalParagraphProps) {
  return (
    <Block component="p" {...textStyles.body} color={color.text.secondary}>
      {children}
    </Block>
  )
}
