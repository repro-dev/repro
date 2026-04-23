import { Col, Grid, Row } from '@jsxstyle/react'
import { color, Logo, spacing } from '@repro/design'
import React from 'react'
import { Outlet } from 'react-router'

export const AuthLayout: React.FC = () => (
  <Grid
    height="100vh"
    alignItems="center"
    justifyContent="center"
    gridAutoRows="auto"
    padding={spacing['4xl']}
    backgroundColor={color.border.default}
    backgroundImage={`linear-gradient(to top right, ${color.border.default}, ${color.bg.subtle})`}
  >
    <Col alignItems="stretch" width={360} maxWidth="100%" gap={spacing['3xl']}>
      <Row paddingH={spacing.md} alignItems="center" gap={spacing.xs}>
        <Logo size={24} />
      </Row>

      <Outlet />
    </Col>
  </Grid>
)
