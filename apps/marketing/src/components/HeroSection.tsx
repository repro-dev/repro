'use client'

// jsxstyle requires a client boundary because it injects styles via React context.

import { Block, Col, Row } from '@jsxstyle/react'
import {
  color,
  focusRing,
  radius,
  spacing,
  textStyles,
  transition,
} from '@repro/design'
import { homepageDemoChips } from './marketingShell'

type HeroSectionProps = {
  appUrl: string
}

export function HeroSection({ appUrl }: HeroSectionProps) {
  return (
    <Row
      component="section"
      alignItems="center"
      gap={spacing['3xl']}
      flexWrap="wrap"
    >
      <Col gap={spacing.xl} flex="1 1 360px" minWidth="320px">
        <Col gap={spacing.md}>
          <Block component="p" {...textStyles.label} color={color.info}>
            Capture bugs with context
          </Block>

          <Block
            component="h1"
            {...textStyles.heading1}
            color={color.text.default}
            maxWidth="11ch"
          >
            Bug reporting that captures every detail
          </Block>

          <Block
            component="p"
            {...textStyles.body}
            color={color.text.secondary}
          >
            Repro automatically captures sessions so your team can reproduce and
            fix bugs faster — without the back-and-forth.
          </Block>
        </Col>

        <Row gap={spacing.md} flexWrap="wrap">
          <Block
            component="a"
            props={{ href: appUrl }}
            {...textStyles.label}
            color={color.text.inverse}
            textDecoration="none"
            backgroundColor={color.info}
            paddingTop={spacing.sm}
            paddingBottom={spacing.sm}
            paddingLeft={spacing.lg}
            paddingRight={spacing.lg}
            borderRadius={radius.md}
            transition={transition.default}
            hoverBackgroundColor={color.primaryHover}
            {...focusRing()}
          >
            Get started free
          </Block>

          <Block
            component="a"
            props={{ href: '#features' }}
            {...textStyles.label}
            color={color.text.default}
            textDecoration="none"
            border={`1px solid ${color.border.default}`}
            paddingTop={spacing.sm}
            paddingBottom={spacing.sm}
            paddingLeft={spacing.lg}
            paddingRight={spacing.lg}
            borderRadius={radius.md}
            transition={transition.default}
            hoverBorderColor={color.border.strong}
            hoverColor={color.text.default}
            {...focusRing()}
          >
            See how it works
          </Block>
        </Row>

        <Row gap={spacing.sm} flexWrap="wrap">
          {homepageDemoChips.map(chip => (
            <Col
              key={chip.label}
              gap={spacing.xs}
              border={`1px solid ${color.border.default}`}
              backgroundColor={color.bg.surface}
              borderRadius={radius.full}
              paddingTop={spacing.sm}
              paddingBottom={spacing.sm}
              paddingLeft={spacing.md}
              paddingRight={spacing.md}
            >
              <Block
                component="span"
                {...textStyles.caption}
                color={color.text.secondary}
              >
                {chip.label}
              </Block>

              <Block
                component="span"
                {...textStyles.label}
                color={color.text.default}
              >
                {chip.value}
              </Block>
            </Col>
          ))}
        </Row>
      </Col>

      <Col
        flex="1 1 360px"
        minWidth="320px"
        gap={spacing.md}
        border={`1px solid ${color.border.default}`}
        backgroundColor={color.bg.surface}
        borderRadius={radius.lg}
        padding={spacing.lg}
      >
        <Row
          justifyContent="space-between"
          alignItems="center"
          gap={spacing.sm}
        >
          <Block component="p" {...textStyles.label} color={color.text.default}>
            Session preview
          </Block>

          <Block
            component="span"
            {...textStyles.caption}
            color={color.text.secondary}
          >
            Live capture
          </Block>
        </Row>

        <Col
          gap={spacing.md}
          border={`1px solid ${color.border.default}`}
          borderRadius={radius.md}
          padding={spacing.md}
          backgroundColor={color.bg.subtle}
        >
          <Row
            justifyContent="space-between"
            alignItems="center"
            gap={spacing.sm}
          >
            <Block
              component="span"
              {...textStyles.code}
              color={color.text.secondary}
            >
              repro.dev/session/417
            </Block>

            <Block
              component="span"
              {...textStyles.caption}
              color={color.text.default}
            >
              12 events captured
            </Block>
          </Row>

          <Col gap={spacing.sm}>
            <Row gap={spacing.sm} flexWrap="wrap">
              <Block
                component="span"
                {...textStyles.caption}
                color={color.text.inverse}
                backgroundColor={color.info}
                borderRadius={radius.full}
                paddingTop={spacing.xs}
                paddingBottom={spacing.xs}
                paddingLeft={spacing.sm}
                paddingRight={spacing.sm}
              >
                Console warning
              </Block>

              <Block
                component="span"
                {...textStyles.caption}
                color={color.text.default}
                border={`1px solid ${color.border.default}`}
                borderRadius={radius.full}
                paddingTop={spacing.xs}
                paddingBottom={spacing.xs}
                paddingLeft={spacing.sm}
                paddingRight={spacing.sm}
              >
                Network request
              </Block>
            </Row>

            <Block
              component="p"
              {...textStyles.bodySmall}
              color={color.text.secondary}
            >
              Automatic screenshots, console logs, and network activity stay
              attached to the repro so the next person sees the same context.
            </Block>
          </Col>
        </Col>
      </Col>
    </Row>
  )
}
