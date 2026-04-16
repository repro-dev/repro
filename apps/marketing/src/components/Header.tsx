'use client'

// jsxstyle requires a client boundary because it injects styles via React context.

import { Block, Row } from '@jsxstyle/react'
import { color, spacing, textStyles } from '@repro/design'
import Link from 'next/link'

const navLinks = [
  { href: '/', label: 'Home' },
  { href: '/privacy', label: 'Privacy' },
  { href: '/terms', label: 'Terms' },
]

export function Header() {
  return (
    <Block
      component="header"
      backgroundColor={color.bg.surface}
      borderBottom={`1px solid ${color.border.default}`}
      position="sticky"
      top="0"
      zIndex="100"
    >
      <Row
        maxWidth="1200px"
        marginH="auto"
        paddingH={spacing['2xl']}
        paddingV={spacing.lg}
        alignItems="center"
        justifyContent="space-between"
      >
        {/* Logo / site name */}
        <Link
          href="/"
          style={{
            ...textStyles.label,
            fontWeight: 700,
            color: color.text.default,
            textDecoration: 'none',
          }}
        >
          Repro
        </Link>

        {/* Navigation links */}
        <Row component="nav" gap={spacing['2xl']} alignItems="center">
          {navLinks.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              style={{
                ...textStyles.label,
                color: color.text.secondary,
                textDecoration: 'none',
              }}
            >
              {label}
            </Link>
          ))}
        </Row>
      </Row>
    </Block>
  )
}
