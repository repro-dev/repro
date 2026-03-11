import { Col } from '@jsxstyle/react'
import { IfSession, UnlessSession } from '@repro/auth'
import { AppShell, Link, SideNav, spacing } from '@repro/design'
import { PlayIcon } from 'lucide-react'
import React from 'react'
import { Outlet, NavLink as RouterNavLink, useMatch } from 'react-router-dom'
import { UserMenu } from '~/components/UserMenu'
import { WorkspaceHeader } from '~/components/WorkspaceHeader'

export const Layout: React.FC = () => {
  const sessionsActive = useMatch({ path: '/', end: true })

  return (
    <AppShell>
      <AppShell.Sidebar>
        <WorkspaceHeader />

        <IfSession>
          <Col flex={1}>
            <SideNav aria-label="Main navigation">
              <SideNav.Item
                icon={PlayIcon}
                label="Sessions"
                active={!!sessionsActive}
                component={RouterNavLink}
                props={{ to: '/' }}
              />
            </SideNav>
          </Col>

          <UserMenu />
        </IfSession>

        <UnlessSession>
          <Col flex={1} padding={spacing.lg}>
            <Link component={RouterNavLink} props={{ to: '/account/login' }}>
              Log In
            </Link>
          </Col>
        </UnlessSession>
      </AppShell.Sidebar>

      <AppShell.Content>
        <Outlet />
      </AppShell.Content>
    </AppShell>
  )
}
