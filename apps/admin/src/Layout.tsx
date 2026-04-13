import { IfSession, UnlessSession, UserMenu, useSession } from '@repro/auth'
import { AppShell, Link, SideNav } from '@repro/design'
import {
  ActivityIcon,
  FlagIcon,
  ShieldIcon,
  UsersIcon,
  VideoIcon,
} from 'lucide-react'
import React from 'react'
import { Outlet, NavLink as RouterNavLink, useMatch } from 'react-router-dom'
import { AdminHeader } from '~/components/AdminHeader'

export const Layout: React.FC = () => {
  const session = useSession()
  const isAdminStaff = session?.type === 'staff' && session.isAdmin

  const recordingsActive = useMatch({ path: '/recordings', end: false })
  const featureGatesActive = useMatch({ path: '/feature-gates', end: false })
  const accountsActive = useMatch({ path: '/accounts', end: false })
  const staffUsersActive = useMatch({ path: '/staff-users', end: false })
  const healthActive = useMatch({ path: '/health', end: false })

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
            <SideNav.Section title="Data">
              <SideNav.Item
                icon={VideoIcon}
                label="Recordings"
                active={!!recordingsActive}
                component={RouterNavLink}
                props={{ to: '/recordings' }}
              />
            </SideNav.Section>

            <SideNav.Section title="Management">
              <SideNav.Item
                icon={FlagIcon}
                label="Feature Gates"
                active={!!featureGatesActive}
                component={RouterNavLink}
                props={{ to: '/feature-gates' }}
              />
              <SideNav.Item
                icon={UsersIcon}
                label="Accounts"
                active={!!accountsActive}
                component={RouterNavLink}
                props={{ to: '/accounts' }}
              />
            </SideNav.Section>

            {isAdminStaff && (
              <SideNav.Section title="Staff">
                <SideNav.Item
                  icon={ShieldIcon}
                  label="Staff Users"
                  active={!!staffUsersActive}
                  component={RouterNavLink}
                  props={{ to: '/staff-users' }}
                />
              </SideNav.Section>
            )}

            <SideNav.Section title="System">
              <SideNav.Item
                icon={ActivityIcon}
                label="Health"
                active={!!healthActive}
                component={RouterNavLink}
                props={{ to: '/health' }}
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
  )
}
