export interface Project {
  id: string
  name: string
}

export interface UserProjectMembership {
  project: Project
  role: ProjectRole
}

export enum ProjectRole {
  Admin = 'admin',
  Contributor = 'contributor',
  Viewer = 'viewer',
}
