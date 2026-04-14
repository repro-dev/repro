import { Col, Grid, Row } from '@jsxstyle/react'
import { color, Logo } from '@repro/design'
import React from 'react'
import { Outlet } from 'react-router'

export const AuthLayout: React.FC = () => (
  <Grid
    height="100vh"
    alignItems="center"
    justifyContent="center"
    gridAutoRows="auto"
    backgroundColor={color.border.default}
    backgroundImage={`linear-gradient(to top right, ${color.border.default}, ${color.bg.subtle})`}
  >
    <Col alignItems="flex-start" gap={20}>
      <Row paddingH={10} alignItems="center" gap={5}>
        <Logo size={24} />
      </Row>

      <Outlet />
    </Col>
  </Grid>
)
