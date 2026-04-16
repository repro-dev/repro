'use client'

// jsxstyle requires a client boundary because it injects styles via React context.

import { Block, Col, Row } from '@jsxstyle/react'
import { color, focusRing, radius, spacing, textStyles } from '@repro/design'
import {
  placeholderPageContent,
  signupHref,
  type MarketingRouteSlug,
} from './marketingShell'

interface MarketingPlaceholderPageProps {
  slug: MarketingRouteSlug
}

export function MarketingPlaceholderPage({
  slug,
}: MarketingPlaceholderPageProps) {
  const page = placeholderPageContent[slug]

  return (
    <Col gap={spacing.xl} paddingV={spacing['2xl']}>
      <Block component="h1" {...textStyles.heading1} color={color.text.default}>
        {page.title}
      </Block>

      <Block component="p" {...textStyles.body} color={color.text.secondary}>
        {page.body}
      </Block>

      <Row gap={spacing.md} flexWrap="wrap">
        <Block
          component="a"
          props={{ href: signupHref }}
          {...textStyles.label}
          color={color.text.inverse}
          textDecoration="none"
          backgroundColor={color.info}
          paddingTop={spacing.sm}
          paddingBottom={spacing.sm}
          paddingLeft={spacing.lg}
          paddingRight={spacing.lg}
          borderRadius={radius.md}
          {...focusRing()}
        >
          Get Started
        </Block>

        <Block
          component="a"
          props={{ href: '/' }}
          {...textStyles.label}
          color={color.text.default}
          textDecoration="none"
          border={`1px solid ${color.border.default}`}
          paddingTop={spacing.sm}
          paddingBottom={spacing.sm}
          paddingLeft={spacing.lg}
          paddingRight={spacing.lg}
          borderRadius={radius.md}
          {...focusRing()}
        >
          Back home
        </Block>
      </Row>
    </Col>
  )
}
