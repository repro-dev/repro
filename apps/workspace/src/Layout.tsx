import { IfSession, UnlessSession, UserMenu } from '@repro/auth'
import { AppShell, Link, SideNav } from '@repro/design'
import {
  CreditCardIcon,
  FolderIcon,
  KeyIcon,
  PlayIcon,
  SettingsIcon,
  UsersIcon,
} from 'lucide-react'
import React from 'react'
import { Outlet, NavLink as RouterNavLink, useMatch } from 'react-router-dom'
import { WorkspaceHeader } from '~/components/WorkspaceHeader'

export const Layout: React.FC = () => {
  const sessionsActive = useMatch({ path: '/', end: true })
  const apiKeysActive = useMatch({ path: '/account/api-keys', end: true })
  const settingsActive = useMatch({ path: '/settings', end: false })

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
            <SideNav.Section title="Main">
              <SideNav.Item
                icon={PlayIcon}
                label="Sessions"
                active={!!sessionsActive}
                component={RouterNavLink}
                props={{ to: '/' }}
              />
              <SideNav.Item icon={FolderIcon} label="Projects" disabled />
            </SideNav.Section>
            <SideNav.Section title="Team">
              <SideNav.Item icon={UsersIcon} label="Members" disabled />
              <SideNav.Item
                icon={SettingsIcon}
                label="Settings"
                active={!!settingsActive}
                component={RouterNavLink}
                props={{ to: '/settings' }}
              />
            </SideNav.Section>
            <SideNav.Section title="Account">
              <SideNav.Item
                icon={KeyIcon}
                label="API Keys"
                active={!!apiKeysActive}
                component={RouterNavLink}
                props={{ to: '/account/api-keys' }}
              />
              <SideNav.Item icon={CreditCardIcon} label="Billing" disabled />
            </SideNav.Section>
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
