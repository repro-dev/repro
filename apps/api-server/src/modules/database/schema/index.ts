import { AccountTable } from './AccountTable'
import { FeatureGateTable } from './FeatureGateTable'
import { InvitationTable } from './InvitationTable'
import { MembershipTable } from './MembershipTable'
import { ProjectRecordingTable } from './ProjectRecordingTable'
import { ProjectTable } from './ProjectTable'
import { RecordingResourceTable } from './RecordingResourceTable'
import { RecordingTable } from './RecordingTable'
import { SessionTable } from './SessionTable'
import { StaffUserTable, asStaffUser } from './StaffUserTable'
import { UserTable, asUser } from './UserTable'

export interface Schema {
  accounts: AccountTable
  feature_gates: FeatureGateTable
  invitations: InvitationTable
  memberships: MembershipTable
  recordings: RecordingTable
  recording_resources: RecordingResourceTable
  projects: ProjectTable
  project_recordings: ProjectRecordingTable
  sessions: SessionTable
  staff_users: StaffUserTable
  users: UserTable
}

export { RecordingResourceTable, RecordingTable, asStaffUser, asUser }
