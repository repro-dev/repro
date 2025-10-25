import { Block, Grid, Row } from '@jsxstyle/react'
import { IfSession, MyAvatar, UnlessSession, useLogout } from '@repro/auth'
import { Logo, colors } from '@repro/design'
import { logger } from '@repro/logger'
import { done } from 'fluture'
import React from 'react'
import { Outlet } from 'react-router'
import { NavLink } from 'react-router-dom'

const navLinkStyle = {
  color: colors.white,
  fontSize: 15,
  textDecoration: 'none',
}

export const Layout: React.FC = () => {
  const logout = useLogout()

  function onSignOut() {
    logout().pipe(
      done(error => {
        if (error) {
          logger.error(error)
        }
      })
    )
  }

  return (
    <Grid
      height="100vh"
      gridTemplateRows="auto 1fr"
      backgroundColor={colors.white}
    >
      <Block
        padding={20}
        height={120}
        backgroundColor={colors.slate['800']}
        backgroundImage={`linear-gradient(to bottom right, ${colors.slate['900']}, ${colors.slate['700']})`}
      >
        <Row alignItems="center">
          <NavLink to="/" style={{ textDecoration: 'none' }}>
            <Row alignItems="center" gap={5}>
              <Logo size={30} inverted={true} />

              <Block
                color={colors.slate['300']}
                fontSize={18}
                textTransform="lowercase"
              >
                / admin
              </Block>
            </Row>
          </NavLink>

          <IfSession>
            <Row alignItems="center" marginLeft={30} gap={15}></Row>

            <Row
              alignItems="center"
              gap={15}
              marginLeft="auto"
              color={colors.white}
            >
              <MyAvatar />

              <Block
                padding={10}
                fontSize={15}
                fontWeight={700}
                color={colors.white}
                backgroundColor={colors.slate['500']}
                backgroundImage={`linear-gradient(to top right, ${colors.slate['600']}, ${colors.slate['500']})`}
                border={`1px solid ${colors.slate['800']}`}
                borderRadius={4}
                boxShadow={`0 2px 4px ${colors.slate['800']}`}
                cursor="pointer"
                props={{ onClick: onSignOut }}
              >
                Sign Out
              </Block>
            </Row>
          </IfSession>

          <UnlessSession>
            <Row alignItems="center" gap={15} marginLeft="auto">
              <NavLink to="/account/login" style={navLinkStyle}>
                Log In
              </NavLink>
            </Row>
          </UnlessSession>
        </Row>
      </Block>

      <Block marginTop={-60} padding={15}>
        <Outlet />
      </Block>
    </Grid>
  )
}
