'use client'

// jsxstyle requires a client boundary because it injects styles via React context.
// When jsxstyle style extraction for SSR/SSG is solved (see Platform issue), this
// boundary can be removed from leaf components.

import { Block, Col, Row } from '@jsxstyle/react'
import {
  Logo,
  color,
  radius,
  spacing,
  textStyles,
  transition,
} from '@repro/design'
import { defaultEnv } from '~/config/env'

export function HeroSection() {
  return (
    <Col
      minHeight="100vh"
      alignItems="center"
      justifyContent="center"
      padding={spacing.xl}
      backgroundColor={color.bg.surface}
    >
      <Col alignItems="center" gap={spacing.xl} maxWidth="640px" width="100%">
        <Logo size={48} />

        <Col alignItems="center" gap={spacing.md}>
          <Block
            component="h1"
            {...textStyles.heading1}
            color={color.text.default}
            textAlign="center"
          >
            Bug reporting that captures every detail
          </Block>

          <Block
            component="p"
            {...textStyles.body}
            color={color.text.secondary}
            textAlign="center"
          >
            Repro automatically captures sessions so your team can reproduce and
            fix bugs faster — without the back-and-forth.
          </Block>
        </Col>

        <Row gap={spacing.md} flexWrap="wrap" justifyContent="center">
          {/* Primary CTA — link to the workspace app */}
          <Block
            component="a"
            props={{ href: defaultEnv.REPRO_APP_URL }}
            backgroundColor={color.info}
            color={color.text.inverse}
            paddingV={spacing.sm}
            paddingH={spacing.lg}
            borderRadius={radius.md}
            {...textStyles.label}
            fontWeight="600"
            textDecoration="none"
            transition={transition.default}
            hoverBackgroundColor={color.primaryHover}
          >
            Get started free
          </Block>

          {/* Secondary CTA — anchor to features section */}
          <Block
            component="a"
            props={{ href: '#features' }}
            border={`1px solid ${color.border.default}`}
            color={color.text.default}
            paddingV={spacing.sm}
            paddingH={spacing.lg}
            borderRadius={radius.md}
            {...textStyles.label}
            fontWeight="600"
            textDecoration="none"
            transition={transition.default}
            hoverBorderColor={color.border.strong}
            hoverColor={color.text.default}
          >
            See how it works
          </Block>
        </Row>
      </Col>
    </Col>
  )
}
