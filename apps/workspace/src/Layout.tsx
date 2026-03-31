import { IfSession, UnlessSession, UserMenu } from '@repro/auth'
import { AppShell, Link, SideNav } from '@repro/design'
import { KeyIcon, PlayIcon, ZapIcon } from 'lucide-react'
import React from 'react'
import { Outlet, NavLink as RouterNavLink, useMatch } from 'react-router-dom'
import { WorkspaceHeader } from '~/components/WorkspaceHeader'

export const Layout: React.FC = () => {
  const sessionsActive = useMatch({ path: '/', end: true })
  const pricingActive = useMatch({ path: '/pricing', end: true })
  const apiKeysActive = useMatch({ path: '/account/api-keys', end: true })

  return (
    <AppShell>
      <AppShell.Sidebar
        header={<WorkspaceHeader />}
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
            <SideNav.Item
              icon={ZapIcon}
              label="Plans"
              active={!!pricingActive}
              component={RouterNavLink}
              props={{ to: '/pricing' }}
            />
            <SideNav.Item
              icon={KeyIcon}
              label="API Keys"
              active={!!apiKeysActive}
              component={RouterNavLink}
              props={{ to: '/account/api-keys' }}
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
