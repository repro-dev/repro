import { Block, Col, Grid, Row } from '@jsxstyle/react'
import { color, colors, Logo } from '@repro/design'
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
        <Block
          padding={5}
          backgroundColor={colors.red['200']}
          color={colors.red['900']}
          fontSize={13}
          fontWeight={700}
          textTransform="lowercase"
          borderRadius={4}
        >
          Admin
        </Block>
      </Row>

      <Outlet />
    </Col>
  </Grid>
)
