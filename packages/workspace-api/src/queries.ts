import type { ApiClient } from '@repro/api-client'
import { ProjectRole } from '@repro/domain'
import { map } from 'fluture'
import type { AccountSettingsSummary } from './types'

export function getProjects(apiClient: ApiClient) {
  return apiClient.fetch('/projects').pipe(map(res => res.items))
}

export function getProject(apiClient: ApiClient, projectId: string) {
  return apiClient.fetch(`/projects/${projectId}`)
}

export function createProject(apiClient: ApiClient, name: string) {
  return apiClient.fetch('/projects', {
    method: 'post',
    body: JSON.stringify({ name }),
  })
}

export function renameProject(
  apiClient: ApiClient,
  projectId: string,
  name: string
) {
  return apiClient.fetch(`/projects/${projectId}/name`, {
    method: 'put',
    body: JSON.stringify({ name }),
    headers: { 'content-type': 'application/json' },
  })
}

export function deactivateProject(apiClient: ApiClient, projectId: string) {
  return apiClient.fetch(`/projects/${projectId}/active`, {
    method: 'put',
    body: JSON.stringify({ active: false }),
    headers: { 'content-type': 'application/json' },
  })
}

export function getProjectRecordings(apiClient: ApiClient, projectId: string) {
  return apiClient
    .fetch(`/projects/${projectId}/recordings`)
    .pipe(map(res => res.items))
}

export function getProjectMembers(apiClient: ApiClient, projectId: string) {
  return apiClient
    .fetch(`/projects/${projectId}/members`)
    .pipe(map(res => res.items))
}

export function inviteProjectMember(
  apiClient: ApiClient,
  email: string,
  _role?: ProjectRole
) {
  // The current backend invite contract only accepts email. Keep the helper
  // signature ready for role support, but do not send unsupported fields.
  return apiClient.fetch('/account/invite', {
    method: 'post',
    body: JSON.stringify({ email }),
  })
}

export function updateProjectMemberRole(
  apiClient: ApiClient,
  projectId: string,
  userId: string,
  role: ProjectRole
) {
  return apiClient.fetch(`/projects/${projectId}/members/${userId}/role`, {
    method: 'put',
    body: JSON.stringify({ role }),
    headers: { 'content-type': 'application/json' },
  })
}

export function removeProjectMember(
  apiClient: ApiClient,
  projectId: string,
  userId: string
) {
  return apiClient.fetch(`/projects/${projectId}/members/${userId}`, {
    method: 'delete',
  })
}

export function getAccountSettings(apiClient: ApiClient) {
  return apiClient.fetch<AccountSettingsSummary>('/account/settings')
}

export function renameAccount(apiClient: ApiClient, name: string) {
  return apiClient.fetch('/account/name', {
    method: 'put',
    body: JSON.stringify({ name }),
    headers: { 'content-type': 'application/json' },
  })
}

export function deleteAccount(apiClient: ApiClient) {
  return apiClient.fetch('/account', {
    method: 'delete',
  })
}
