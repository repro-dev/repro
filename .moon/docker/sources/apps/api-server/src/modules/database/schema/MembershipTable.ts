import { ProjectRole } from '@repro/domain'

export interface MembershipTable {
  userId: number
  projectId: number
  role: ProjectRole
}
