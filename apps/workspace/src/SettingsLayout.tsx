import { IfSession, UserMenu } from '@repro/auth'
import { AppShell, SideNav } from '@repro/design'
import {
  ArrowLeftIcon,
  CreditCardIcon,
  SettingsIcon,
  UserIcon,
  UsersIcon,
} from 'lucide-react'
import React from 'react'
import { Outlet, NavLink as RouterNavLink, useMatch } from 'react-router-dom'
import { WorkspaceHeader } from '~/components/WorkspaceHeader'

export const SettingsLayout: React.FC = () => {
  const profileActive = useMatch({ path: '/settings/profile', end: true })
  const accountActive = useMatch({ path: '/settings/account', end: true })
  const teamActive = useMatch({ path: '/settings/team', end: true })
  const billingActive = useMatch({ path: '/settings/billing', end: true })

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
        {/* Back to main workspace */}
        <SideNav aria-label="Settings navigation">
          <SideNav.Section title="Back">
            <SideNav.Item
              icon={ArrowLeftIcon}
              label="Workspace"
              component={RouterNavLink}
              props={{ to: '/' }}
            />
          </SideNav.Section>

          <SideNav.Section title="Settings">
            <SideNav.Item
              icon={UserIcon}
              label="Profile"
              active={!!profileActive}
              component={RouterNavLink}
              props={{ to: '/settings/profile' }}
            />
            <SideNav.Item
              icon={SettingsIcon}
              label="Account"
              active={!!accountActive}
              component={RouterNavLink}
              props={{ to: '/settings/account' }}
            />
            <SideNav.Item
              icon={UsersIcon}
              label="Team"
              active={!!teamActive}
              component={RouterNavLink}
              props={{ to: '/settings/team' }}
            />
            <SideNav.Item
              icon={CreditCardIcon}
              label="Billing"
              active={!!billingActive}
              component={RouterNavLink}
              props={{ to: '/settings/billing' }}
            />
          </SideNav.Section>
        </SideNav>
      </AppShell.Sidebar>

      <AppShell.Content>
        <Outlet />
      </AppShell.Content>
    </AppShell>
  )
}
