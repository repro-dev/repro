'use client'

// jsxstyle requires a client boundary because it injects styles via React context.

import { Block, Col } from '@jsxstyle/react'
import { color, spacing, textStyles } from '@repro/design'
import React from 'react'
import { Footer } from './Footer'
import { Header } from './Header'
import { shellMaxWidth } from './marketingShell'

interface SiteLayoutProps {
  children: React.ReactNode
}

export function SiteLayout({ children }: SiteLayoutProps) {
  return (
    <Col minHeight="100vh" backgroundColor={color.bg.subtle}>
      {/* Skip-to-content link for keyboard/screen-reader users.
          Styled via .skip-link class in globals.css. */}
      <a
        href="#main-content"
        className="skip-link"
        style={{
          ...textStyles.label,
          color: color.text.inverse,
          backgroundColor: color.info,
          textDecoration: 'none',
        }}
      >
        Skip to main content
      </a>

      <Header />

      <Block
        component="main"
        props={{ id: 'main-content' }}
        flex="1"
        width="100%"
        maxWidth={shellMaxWidth}
        marginH="auto"
        paddingH={spacing.lg}
        paddingV={spacing['3xl']}
      >
        {children}
      </Block>

      <Footer />
    </Col>
  )
}
