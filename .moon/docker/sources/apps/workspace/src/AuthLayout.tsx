import { colors, Logo } from '@repro/design'
import { Col, Grid, Row } from '@jsxstyle/react'
import React from 'react'
import { Outlet } from 'react-router'

export const AuthLayout: React.FC = () => (
  <Grid
    height="100vh"
    alignItems="center"
    justifyContent="center"
    gridAutoRows="auto"
    backgroundColor={colors.slate['200']}
    backgroundImage={`linear-gradient(to top right, ${colors.slate['200']}, ${colors.slate['50']})`}
  >
    <Col alignItems="flex-start" gap={20}>
      <Row paddingH={10} alignItems="center" gap={5}>
        <Logo size={24} />
      </Row>

      <Outlet />
    </Col>
  </Grid>
)
