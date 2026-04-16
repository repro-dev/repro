'use client'

// jsxstyle requires a client boundary because it injects styles via React context.

import { Block, Row } from '@jsxstyle/react'
import { color, spacing, textStyles } from '@repro/design'
import Link from 'next/link'

const footerLinks = [
  { href: '/privacy', label: 'Privacy Policy' },
  { href: '/terms', label: 'Terms of Service' },
  { href: '/refund-policy', label: 'Refund Policy' },
]

export function Footer() {
  const year = new Date().getFullYear()

  return (
    <Block
      component="footer"
      backgroundColor={color.bg.surface}
      borderTop={`1px solid ${color.border.default}`}
    >
      <Row
        maxWidth="1200px"
        marginH="auto"
        paddingH={spacing['2xl']}
        paddingV={spacing.xl}
        alignItems="center"
        justifyContent="space-between"
        flexWrap="wrap"
        gap={spacing.lg}
      >
        {/* Copyright */}
        <Block {...textStyles.bodySmall} color={color.text.secondary}>
          © {year} Repro
        </Block>

        {/* Footer links */}
        <Row component="nav" gap={spacing.xl} flexWrap="wrap">
          {footerLinks.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              style={{
                ...textStyles.bodySmall,
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
