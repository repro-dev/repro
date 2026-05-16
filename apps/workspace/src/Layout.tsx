import { IfSession, UnlessSession, UserMenu, useSession } from '@repro/auth'
import { AppShell, Divider, Link, SideNav } from '@repro/design'
import { CreditCardIcon, ListVideoIcon, SettingsIcon } from 'lucide-react'
import React from 'react'
import { Outlet, NavLink as RouterNavLink, useMatch } from 'react-router-dom'
import {
  ProjectSettingsNavItem,
  ProjectSettingsNavItemProps,
} from '~/components/ProjectSettingsNavItem'
import { ProjectSwitcher } from '~/components/ProjectSwitcher'
import { WorkspaceHeader } from '~/components/WorkspaceHeader'
import { ProjectProvider, ProjectProviderProps } from './ProjectContext'

export interface LayoutProps {
  projectGetProjects?: ProjectProviderProps['getProjects']
  projectSettingsGetMembers?: ProjectSettingsNavItemProps['getMembers']
}

export const Layout: React.FC<LayoutProps> = ({
  projectGetProjects,
  projectSettingsGetMembers,
}) => {
  const sessionsActive = useMatch({ path: '/', end: true })
  const session = useSession()
  // Billing lives under /settings/billing; match it separately so the
  // Settings item can exclude billing routes from its active range.
  const billingActive = useMatch({ path: '/settings/billing', end: false })
  const accountSettingsActive = useMatch({
    path: '/settings/account',
    end: false,
  })
  const settingsActive = useMatch({ path: '/settings', end: false })

  return (
    <ProjectProvider getProjects={projectGetProjects}>
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
              <ProjectSwitcher />

              <SideNav.Item
                icon={ListVideoIcon}
                label="Sessions"
                active={!!sessionsActive}
                component={RouterNavLink}
                props={{ to: '/' }}
              />
              <ProjectSettingsNavItem getMembers={projectSettingsGetMembers} />

              <Divider />

              <SideNav.Section title="Account">
                <SideNav.Item
                  icon={SettingsIcon}
                  label="Settings"
                  // Active for all /settings/* routes except /settings/billing,
                  // which is handled by the Billing item below.
                  active={
                    !!settingsActive && !billingActive && !accountSettingsActive
                  }
                  component={RouterNavLink}
                  props={{ to: '/settings' }}
                />
                {session != null &&
                  'admin' in session &&
                  session.admin === true && (
                    <SideNav.Item
                      icon={SettingsIcon}
                      label="Account"
                      active={!!accountSettingsActive}
                      component={RouterNavLink}
                      props={{ to: '/settings/account' }}
                    />
                  )}
                <SideNav.Item
                  icon={CreditCardIcon}
                  label="Billing"
                  active={!!billingActive}
                  component={RouterNavLink}
                  props={{ to: '/settings/billing' }}
                />
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
    </ProjectProvider>
  )
}
