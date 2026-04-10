import { ProjectRole, User } from '@repro/domain'

export interface ProjectMember {
  user: User
  role: ProjectRole
}
