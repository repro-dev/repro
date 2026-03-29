import { IfSession, UnlessSession, UserMenu } from '@repro/auth'
import { AppShell, Link, SideNav } from '@repro/design'
import { CreditCardIcon, FlagIcon, SettingsIcon, UsersIcon } from 'lucide-react'
import React from 'react'
import { Outlet, NavLink as RouterNavLink, useMatch } from 'react-router-dom'
import { AdminHeader } from '~/components/AdminHeader'

export const Layout: React.FC = () => {
  const allUsersActive = useMatch({ path: '/', end: true })

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
            <SideNav.Section title="Users">
              <SideNav.Item
                icon={UsersIcon}
                label="All Users"
                active={!!allUsersActive}
                component={RouterNavLink}
                props={{ to: '/' }}
              />
              <SideNav.Item icon={UsersIcon} label="Accounts" disabled />
            </SideNav.Section>
            <SideNav.Section title="Platform">
              <SideNav.Item icon={FlagIcon} label="Feature Flags" disabled />
              <SideNav.Item
                icon={CreditCardIcon}
                label="Billing Plans"
                disabled
              />
            </SideNav.Section>
            <SideNav.Section title="System">
              <SideNav.Item icon={SettingsIcon} label="Settings" disabled />
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
