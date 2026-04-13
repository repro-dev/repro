import { useApiClient } from '@repro/api-client'
import { useSession } from '@repro/auth'
import { SideNav } from '@repro/design'
import { ProjectRole } from '@repro/domain'
import { useFuture } from '@repro/future-utils'
import {
  ProjectMember,
  getProjectMembers as defaultGetProjectMembers,
} from '@repro/workspace-api'
import { resolve } from 'fluture'
import { SettingsIcon } from 'lucide-react'
import React from 'react'
import { NavLink as RouterNavLink, useMatch } from 'react-router-dom'
import { useProjectContext } from '~/ProjectContext'

export interface ProjectSettingsNavItemProps {
  getMembers?: typeof defaultGetProjectMembers
}

export function ProjectSettingsNavItem({
  getMembers = defaultGetProjectMembers,
}: ProjectSettingsNavItemProps) {
  const apiClient = useApiClient()
  const session = useSession()
  const { selectedProject, loading: projectsLoading } = useProjectContext()
  const projectSettingsActive = useMatch({
    path: '/projects/:projectId/settings',
    end: true,
  })

  const {
    loading: membersLoading,
    data: members,
    error,
  } = useFuture(() => {
    if (!session || !selectedProject) {
      return resolve([] as ProjectMember[])
    }

    return getMembers(apiClient, selectedProject.id)
  }, [apiClient, getMembers, selectedProject?.id, session?.id])

  if (
    projectsLoading ||
    !session ||
    !selectedProject ||
    membersLoading ||
    error
  ) {
    return null
  }

  const currentMember = members.find(
    (member: ProjectMember) => member.user.id === session.id
  )

  if (currentMember?.role !== ProjectRole.Admin) {
    return null
  }

  return (
    <SideNav.Item
      icon={SettingsIcon}
      label="Project Settings"
      active={!!projectSettingsActive}
      component={RouterNavLink}
      props={{ to: `/projects/${selectedProject.id}/settings` }}
    />
  )
}
