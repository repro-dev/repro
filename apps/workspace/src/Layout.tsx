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
        backgroundImage={`linear-gradient(to bottom right, ${colors.blue['900']}, ${colors.blue['700']})`}
      >
        <Row alignItems="center">
          <NavLink to="/" style={{ textDecoration: 'none' }}>
            <Logo size={30} inverted={true} />
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
                backgroundImage={`linear-gradient(to top right, ${colors.blue['600']}, ${colors.blue['500']})`}
                border={`1px solid ${colors.blue['800']}`}
                borderRadius={4}
                boxShadow={`0 2px 4px ${colors.blue['800']}`}
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
