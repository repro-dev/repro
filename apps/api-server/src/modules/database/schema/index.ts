import { AccountTable } from './AccountTable'
import { BillingCustomerTable } from './BillingCustomerTable'
import { BillingEventTable } from './BillingEventTable'
import { BillingPlanEntitlementTable } from './BillingPlanEntitlementTable'
import { BillingPlanTable } from './BillingPlanTable'
import { BillingSubscriptionTable } from './BillingSubscriptionTable'
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
  billing_customers: BillingCustomerTable
  billing_events: BillingEventTable
  billing_plan_entitlements: BillingPlanEntitlementTable
  billing_plans: BillingPlanTable
  billing_subscriptions: BillingSubscriptionTable
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
