'use client'

// jsxstyle requires a client boundary because it injects styles via React context.

import { Block, Col, Grid } from '@jsxstyle/react'
import { color, radius, spacing, textStyles } from '@repro/design'
import { HeroSection } from './HeroSection'
import {
  homepageFeatureHighlights,
  homepageSocialProof,
} from './marketingShell'

type HomePageContentProps = {
  appUrl: string
}

export function HomePageContent({ appUrl }: HomePageContentProps) {
  return (
    <Col gap={spacing['4xl']}>
      <HeroSection appUrl={appUrl} />

      <Col component="section" id="features" gap={spacing.lg}>
        <Col gap={spacing.sm} maxWidth="44rem">
          <Block
            component="h2"
            {...textStyles.heading2}
            color={color.text.default}
          >
            Everything you need to move from report to fix
          </Block>

          <Block
            component="p"
            {...textStyles.body}
            color={color.text.secondary}
          >
            Repro keeps the bug, the context, and the conversation together so
            the team can focus on the fix.
          </Block>
        </Col>

        <Grid
          gap={spacing.lg}
          gridTemplateColumns="repeat(auto-fit, minmax(220px, 1fr))"
        >
          {homepageFeatureHighlights.map(feature => (
            <Col
              key={feature.title}
              gap={spacing.sm}
              padding={spacing.lg}
              border={`1px solid ${color.border.default}`}
              backgroundColor={color.bg.surface}
              borderRadius={radius.lg}
            >
              <Block
                component="h3"
                {...textStyles.heading3}
                color={color.text.default}
              >
                {feature.title}
              </Block>

              <Block
                component="p"
                {...textStyles.bodySmall}
                color={color.text.secondary}
              >
                {feature.body}
              </Block>
            </Col>
          ))}
        </Grid>
      </Col>

      <Col component="section" gap={spacing.lg}>
        <Col gap={spacing.sm} maxWidth="44rem">
          <Block
            component="h2"
            {...textStyles.heading2}
            color={color.text.default}
          >
            Teams keep shipping with the same source of truth
          </Block>

          <Block
            component="p"
            {...textStyles.body}
            color={color.text.secondary}
          >
            A single repro keeps support, QA, and engineering aligned.
          </Block>
        </Col>

        <Grid
          gap={spacing.lg}
          gridTemplateColumns="repeat(auto-fit, minmax(220px, 1fr))"
        >
          {homepageSocialProof.map(proof => (
            <Col
              key={proof.name}
              gap={spacing.md}
              padding={spacing.lg}
              border={`1px solid ${color.border.default}`}
              backgroundColor={color.bg.surface}
              borderRadius={radius.lg}
            >
              <Block
                component="p"
                {...textStyles.body}
                color={color.text.default}
              >
                “{proof.quote}”
              </Block>

              <Col gap={spacing.xs}>
                <Block
                  component="span"
                  {...textStyles.label}
                  color={color.text.default}
                >
                  {proof.name}
                </Block>

                <Block
                  component="span"
                  {...textStyles.caption}
                  color={color.text.secondary}
                >
                  {proof.role}
                </Block>
              </Col>
            </Col>
          ))}
        </Grid>
      </Col>
    </Col>
  )
}
