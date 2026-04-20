'use client'

import { Block, Col, Grid, Row } from '@jsxstyle/react'
import { color, focusRing, radius, spacing, textStyles } from '@repro/design'
import React from 'react'
import { footerGroups, shellMaxWidth, socialLinks } from './marketingShell'

void React

export function Footer() {
  const year = new Date().getFullYear()

  return (
    <Block
      component="footer"
      borderTop={`1px solid ${color.border.default}`}
      backgroundColor={color.bg.surface}
    >
      <Col
        maxWidth={shellMaxWidth}
        marginH="auto"
        padding={spacing.lg}
        gap={spacing.xl}
      >
        <Grid
          className="marketing-shell__footer-grid"
          gap={spacing.xl}
          gridTemplateColumns="repeat(4, minmax(0, 1fr))"
        >
          {footerGroups.map(group => (
            <Col key={group.title} gap={spacing.md}>
              <Block
                component="h2"
                {...textStyles.label}
                color={color.text.default}
              >
                {group.title}
              </Block>

              <Col component="nav" gap={spacing.sm}>
                {group.links.map(link => (
                  <Block
                    key={link.href}
                    component="a"
                    props={{ href: link.href }}
                    {...textStyles.bodySmall}
                    color={color.text.secondary}
                    textDecoration="none"
                    {...focusRing()}
                  >
                    {link.label}
                  </Block>
                ))}
              </Col>
            </Col>
          ))}
        </Grid>

        <Row
          alignItems="center"
          justifyContent="space-between"
          gap={spacing.md}
          flexWrap="wrap"
        >
          <Block {...textStyles.bodySmall} color={color.text.secondary}>
            © {year} Repro
          </Block>

          <Row
            component="nav"
            aria-label="Social links"
            gap={spacing.md}
            flexWrap="wrap"
          >
            {socialLinks.map(link => (
              <Block
                key={link.href}
                component="a"
                props={{ href: link.href, target: '_blank', rel: 'noreferrer' }}
                {...textStyles.bodySmall}
                color={color.text.secondary}
                textDecoration="none"
                paddingTop={spacing.xs}
                paddingBottom={spacing.xs}
                paddingLeft={spacing.sm}
                paddingRight={spacing.sm}
                borderRadius={radius.md}
                {...focusRing()}
              >
                {link.label}
              </Block>
            ))}
          </Row>
        </Row>
      </Col>
    </Block>
  )
}
