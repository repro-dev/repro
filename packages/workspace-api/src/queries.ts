import type { ApiClient } from '@repro/api-client'
import { ProjectRole, RecordingPrivacyPreset } from '@repro/domain'
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
  })
}

export function deactivateProject(apiClient: ApiClient, projectId: string) {
  return apiClient.fetch(`/projects/${projectId}/active`, {
    method: 'put',
    body: JSON.stringify({ active: false }),
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
  })
}

export function deleteAccount(apiClient: ApiClient) {
  return apiClient.fetch('/account', {
    method: 'delete',
  })
}

export function createShareToken(
  apiClient: ApiClient,
  projectId: string,
  recordingId: string,
  expiresAt?: string | null
) {
  return apiClient.fetch(
    `/projects/${projectId}/recordings/${recordingId}/share`,
    {
      method: 'post',
      body: JSON.stringify({ expiresAt: expiresAt ?? null }),
    }
  )
}

export function listShareTokens(
  apiClient: ApiClient,
  projectId: string,
  recordingId: string
) {
  return apiClient
    .fetch(`/projects/${projectId}/recordings/${recordingId}/shares`)
    .pipe(map(res => res.items))
}

export function revokeShareToken(
  apiClient: ApiClient,
  projectId: string,
  recordingId: string,
  tokenId: string
) {
  return apiClient.fetch(
    `/projects/${projectId}/recordings/${recordingId}/share/${tokenId}`,
    {
      method: 'delete',
    }
  )
}

export function resolveShareToken(apiClient: ApiClient, token: string) {
  return apiClient.fetch(`/share/${token}`)
}

export function getRecordingPrivacyPreset(apiClient: ApiClient) {
  return apiClient.fetch<{ value: RecordingPrivacyPreset }>('/account/privacy')
}

export function updateRecordingPrivacyPreset(
  apiClient: ApiClient,
  preset: RecordingPrivacyPreset
) {
  return apiClient.fetch('/account/privacy', {
    method: 'put',
    body: JSON.stringify({ value: preset }),
  })
}
