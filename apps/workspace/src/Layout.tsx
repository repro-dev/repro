import { IfSession, UnlessSession, UserMenu } from '@repro/auth'
import { AppShell, Link, SideNav } from '@repro/design'
import { PlayIcon, SettingsIcon } from 'lucide-react'
import React from 'react'
import { Outlet, NavLink as RouterNavLink, useMatch } from 'react-router-dom'
import { ProjectSwitcher } from '~/components/ProjectSwitcher'
import { WorkspaceHeader } from '~/components/WorkspaceHeader'
import { ProjectProvider } from './ProjectContext'

export const Layout: React.FC = () => {
  const sessionsActive = useMatch({ path: '/', end: true })
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
                  icon={SettingsIcon}
                  label="Settings"
                  active={!!settingsActive}
                  component={RouterNavLink}
                  props={{ to: '/settings' }}
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
