import { IfSession, UnlessSession, UserMenu } from '@repro/auth'
import { AppShell, Link, SideNav } from '@repro/design'
import {
  CreditCardIcon,
  FolderIcon,
  PlayIcon,
  SettingsIcon,
} from 'lucide-react'
import React from 'react'
import {
  Outlet,
  Link as RouterLink,
  NavLink as RouterNavLink,
  useMatch,
} from 'react-router-dom'
import { ProjectSwitcher } from '~/components/ProjectSwitcher'
import { WorkspaceHeader } from '~/components/WorkspaceHeader'
import { ProjectProvider } from './ProjectContext'

export const Layout: React.FC = () => {
  const sessionsActive = useMatch({ path: '/', end: true })
  const projectsActive = useMatch({ path: '/projects', end: false })
  const projectSettingsSubtreeActive = useMatch({
    path: '/projects/:projectId/settings',
    end: false,
  })
  // Billing lives under /settings/billing; match it separately so the
  // Settings item can exclude billing routes from its active range.
  const billingActive = useMatch({ path: '/settings/billing', end: false })
  const settingsActive = useMatch({ path: '/settings', end: false })

  return (
    <ProjectProvider>
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
              <SideNav.Section title="Project">
                <ProjectSwitcher />
              </SideNav.Section>

              <SideNav.Section title="Main">
                <SideNav.Item
                  icon={PlayIcon}
                  label="Sessions"
                  active={!!sessionsActive}
                  component={RouterNavLink}
                  props={{ to: '/' }}
                />
                <SideNav.Item
                  icon={FolderIcon}
                  label="Projects"
                  active={!!projectsActive && !projectSettingsSubtreeActive}
                  component={RouterLink}
                  props={{ to: '/projects' }}
                />
              </SideNav.Section>

              <SideNav.Section title="Account">
                <SideNav.Item
                  icon={SettingsIcon}
                  label="Settings"
                  // Active for all /settings/* routes except /settings/billing,
                  // which is handled by the Billing item below.
                  active={!!settingsActive && !billingActive}
                  component={RouterNavLink}
                  props={{ to: '/settings' }}
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
