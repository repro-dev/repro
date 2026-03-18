import { IfSession, UnlessSession, UserMenu } from '@repro/auth'
import { AppShell, Link, SideNav } from '@repro/design'
import { PlayIcon } from 'lucide-react'
import React from 'react'
import { Outlet, NavLink as RouterNavLink, useMatch } from 'react-router-dom'
import { AdminHeader } from '~/components/AdminHeader'

export const Layout: React.FC = () => {
  const sessionsActive = useMatch({ path: '/', end: true })

  return (
    <AppShell>
      <AppShell.Sidebar
        header={<AdminHeader />}
        footer={
          <IfSession>
            <UserMenu />
          </IfSession>
        }
      >
        <IfSession>
          <SideNav aria-label="Main navigation">
            <SideNav.Item
              icon={PlayIcon}
              label="Sessions"
              active={!!sessionsActive}
              component={RouterNavLink}
              props={{ to: '/' }}
            />
          </SideNav>
        </IfSession>

        <UnlessSession>
          <Link component={RouterNavLink} props={{ to: '/account/login' }}>
            Log In
          </Link>
        </UnlessSession>
      </AppShell.Sidebar>

      <AppShell.Content>
        <Outlet />
      </AppShell.Content>
    </AppShell>
  )
}
