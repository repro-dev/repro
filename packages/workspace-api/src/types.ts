import { ProjectRole, User } from '@repro/domain'

export type { AccountSettingsSummary } from '@repro/domain'

export interface ProjectMember {
  user: User
  role: ProjectRole
}
