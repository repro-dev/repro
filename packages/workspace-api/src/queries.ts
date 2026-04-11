import type { ApiClient } from '@repro/api-client'
import { map } from 'fluture'

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
