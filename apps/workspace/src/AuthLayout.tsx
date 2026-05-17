import { Col, Row } from '@jsxstyle/react'
import { color, Logo, ParticleArtwork, spacing } from '@repro/design'
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
      padding={spacing['4xl']}
      backgroundColor={color.bg.surface}
    >
      <Col
        alignItems="stretch"
        width="100%"
        maxWidth={440}
        gap={spacing['2xl']}
      >
        <Row alignItems="center" gap={spacing.sm}>
          <Logo size={24} />
        </Row>

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
      <ParticleArtwork palette={artworkPalette} seed={29} />
    </Col>
  </Row>
)
