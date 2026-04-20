'use client'

// This component stays client-side because it owns the mobile menu state.
// jsxstyle itself is server-compatible once the app root uses the registry.

import { Block, Col, Row } from '@jsxstyle/react'
import {
  Logo,
  color,
  focusRing,
  radius,
  spacing,
  textStyles,
} from '@repro/design'
import React, { useState } from 'react'
import { primaryNavLinks, shellMaxWidth, signupHref } from './marketingShell'

void React

export function Header() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  return (
    <Block
      component="header"
      position="sticky"
      top="0"
      zIndex="100"
      backgroundColor={color.bg.surface}
      borderBottom={`1px solid ${color.border.default}`}
    >
      <Row
        maxWidth={shellMaxWidth}
        marginH="auto"
        paddingH={spacing.lg}
        paddingV={spacing.lg}
        alignItems="center"
        justifyContent="space-between"
        gap={spacing.md}
      >
        <Block
          component="a"
          props={{ href: '/', 'aria-label': 'Repro home' }}
          display="inline-flex"
        >
          <Logo size={36} />
        </Block>

        <Row
          component="nav"
          className="marketing-shell__desktop-nav"
          alignItems="center"
          gap={spacing.xl}
        >
          {primaryNavLinks.map(({ href, label }) => (
            <Block
              key={href}
              component="a"
              props={{ href }}
              {...textStyles.label}
              color={color.text.secondary}
              textDecoration="none"
              {...focusRing()}
            >
              {label}
            </Block>
          ))}
        </Row>

        <Row alignItems="center" gap={spacing.sm}>
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

          <Row
            component="button"
            className="marketing-shell__mobile-toggle"
            alignItems="center"
            gap={spacing.xs}
            border={`1px solid ${color.border.default}`}
            borderRadius={radius.md}
            paddingH={spacing.md}
            paddingV={spacing.sm}
            backgroundColor="transparent"
            color={color.text.default}
            cursor="pointer"
            {...textStyles.label}
            {...focusRing()}
            props={{ type: 'button', onClick: () => setMobileMenuOpen(true) }}
          >
            <Block component="span" lineHeight={1}>
              ☰
            </Block>
            Menu
          </Row>
        </Row>
      </Row>

      {mobileMenuOpen ? (
        <Block
          position="fixed"
          top={0}
          left={0}
          right={0}
          bottom={0}
          zIndex="200"
          backgroundColor={color.bg.subtle}
          props={{
            role: 'dialog',
            'aria-modal': 'true',
            'aria-labelledby': 'marketing-menu-title',
            onClick: () => setMobileMenuOpen(false),
          }}
        >
          <Block
            position="absolute"
            top={0}
            right={0}
            bottom={0}
            width="100%"
            maxWidth={360}
            backgroundColor={color.bg.surface}
            padding={spacing['2xl']}
            props={{ onClick: event => event.stopPropagation() }}
          >
            <Col gap={spacing.xl}>
              <Row
                alignItems="center"
                justifyContent="space-between"
                gap={spacing.md}
              >
                <Block
                  component="h2"
                  id="marketing-menu-title"
                  {...textStyles.heading3}
                >
                  Site navigation
                </Block>

                <Row
                  component="button"
                  alignItems="center"
                  justifyContent="center"
                  width={spacing['3xl']}
                  height={spacing['3xl']}
                  border={`1px solid ${color.border.default}`}
                  borderRadius={radius.full}
                  backgroundColor="transparent"
                  cursor="pointer"
                  props={{
                    type: 'button',
                    onClick: () => setMobileMenuOpen(false),
                  }}
                  {...focusRing()}
                >
                  <Block component="span" lineHeight={1}>
                    ×
                  </Block>
                </Row>
              </Row>

              <Col component="nav" gap={spacing.md}>
                {primaryNavLinks.map(({ href, label }) => (
                  <Block
                    key={href}
                    component="a"
                    props={{ href, onClick: () => setMobileMenuOpen(false) }}
                    {...textStyles.label}
                    color={color.text.secondary}
                    textDecoration="none"
                    {...focusRing()}
                  >
                    {label}
                  </Block>
                ))}
              </Col>

              <Block
                component="a"
                props={{
                  href: signupHref,
                  onClick: () => setMobileMenuOpen(false),
                }}
                display="inline-flex"
                alignSelf="flex-start"
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
            </Col>
          </Block>
        </Block>
      ) : null}
    </Block>
  )
}
