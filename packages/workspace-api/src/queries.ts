import { ApiClient } from '@repro/api-client'
import { ListResponse, Project, RecordingInfo } from '@repro/domain'
import { map } from 'fluture'
import { ProjectMember } from './types'

export function getProjects(apiClient: ApiClient) {
  return apiClient
    .fetch<ListResponse<Project>>('/projects')
    .pipe(map(res => res.items))
}

export function getProject(apiClient: ApiClient, projectId: string) {
  return apiClient.fetch<Project>(`/projects/${projectId}`)
}

export function createProject(apiClient: ApiClient, name: string) {
  return apiClient.fetch<Project>('/projects', {
    method: 'post',
    body: JSON.stringify({ name }),
    headers: { 'content-type': 'application/json' },
  })
}

export function renameProject(
  apiClient: ApiClient,
  projectId: string,
  name: string
) {
  return apiClient.fetch<Project>(`/projects/${projectId}/name`, {
    method: 'put',
    body: JSON.stringify({ name }),
    headers: { 'content-type': 'application/json' },
  })
}

export function deactivateProject(apiClient: ApiClient, projectId: string) {
  return apiClient.fetch<void>(`/projects/${projectId}/active`, {
    method: 'put',
    body: JSON.stringify({ active: false }),
    headers: { 'content-type': 'application/json' },
  })
}

export function getProjectRecordings(apiClient: ApiClient, projectId: string) {
  return apiClient
    .fetch<ListResponse<RecordingInfo>>(`/projects/${projectId}/recordings`)
    .pipe(map(res => res.items))
}

export function getProjectMembers(apiClient: ApiClient, projectId: string) {
  return apiClient
    .fetch<ListResponse<ProjectMember>>(`/projects/${projectId}/members`)
    .pipe(map(res => res.items))
}
