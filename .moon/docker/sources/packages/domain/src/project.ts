export interface Project {
  id: string
  name: string
}

export enum ProjectRole {
  Admin = 'admin',
  Contributor = 'contributor',
  Viewer = 'viewer',
}
