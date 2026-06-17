/* eslint-disable @repro/oxlint-plugin-design/no-hardcoded-spacing */
import { Block, Col, Row } from '@jsxstyle/react'
import { color, Logo, ParticleArtwork, spacing, Text } from '@repro/design'
import React from 'react'
import { Outlet } from 'react-router'

const artworkPalette = {
  backgroundStart: color.bg.subtle,
  backgroundEnd: color.bg.surface,
  particle: color.text.muted,
  particleAlt: color.border.strong,
  line: color.border.default,
  glow: color.border.strong,
}

export const AuthLayout: React.FC = () => (
  <Row
    minHeight="100vh"
    alignItems="stretch"
    flexWrap="wrap"
    backgroundColor={color.bg.subtle}
  >
    <Col
      flex={1}
      flexBasis={360}
      minWidth={0}
      alignItems="stretch"
      justifyContent="flex-start"
      gap={spacing['3xl']}
      backgroundColor={color.bg.surface}
    >
      <Block
        width="100%"
        paddingH={spacing['4xl']}
        paddingV={spacing['2xl']}
        backgroundColor={color.bg.emphasis}
        color={color.text.inverse}
        borderBottomColor={color.border.emphasis}
        borderBottomStyle="solid"
        borderBottomWidth={1}
      >
        <Row alignItems="center" gap={spacing.md}>
          <Logo size={24} inverted />
          <Text variant="body" as="span" weight="light" lineHeight="tight">
            admin
          </Text>
        </Row>
      </Block>

      <Col
        alignItems="stretch"
        width="100%"
        gap={spacing['2xl']}
        paddingH={spacing['4xl']}
      >
        <Outlet />
      </Col>
    </Col>
    <Col
      flex={2}
      flexBasis={720}
      minWidth={0}
      alignItems="stretch"
      overflow="hidden"
      borderLeftColor={color.border.default}
      borderLeftStyle="solid"
      borderLeftWidth={1}
      backgroundColor={artworkPalette.backgroundStart}
    >
      <ParticleArtwork palette={artworkPalette} seed={17} />
    </Col>
  </Row>
)
