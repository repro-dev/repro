import { AccountTable } from './AccountTable'
import { AgenticConversationMessageTable } from './AgenticConversationMessageTable'
import { AgenticConversationTable } from './AgenticConversationTable'
import { AgenticFeedbackTable } from './AgenticFeedbackTable'
import { ApiKeyTable } from './ApiKeyTable'
import { BillingCustomerTable } from './BillingCustomerTable'
import { BillingEventTable } from './BillingEventTable'
import { BillingPlanEntitlementTable } from './BillingPlanEntitlementTable'
import { BillingPlanTable } from './BillingPlanTable'
import { BillingSubscriptionTable } from './BillingSubscriptionTable'
import { FeatureGateTable } from './FeatureGateTable'
import { InvitationTable } from './InvitationTable'
import { MembershipTable } from './MembershipTable'
import { OAuthAuthorizationCodeTable } from './OAuthAuthorizationCodeTable'
import { OAuthClientTable } from './OAuthClientTable'
import { OAuthConnectionTable } from './OAuthConnectionTable'
import { OutboxJobTable } from './OutboxJobTable'
import { PasswordResetTokenTable } from './PasswordResetTokenTable'
import { PmConnectionTable } from './PmConnectionTable'
import { ProjectRecordingTable } from './ProjectRecordingTable'
import { ProjectTable } from './ProjectTable'
import { RecordingErrorTable } from './RecordingErrorTable'
import { RecordingEventIndexTable } from './RecordingEventIndexTable'
import { RecordingResourceTable } from './RecordingResourceTable'
import { RecordingTable } from './RecordingTable'
import { SessionTable } from './SessionTable'
import { StaffUserTable, asStaffUser } from './StaffUserTable'
import { UserTable, asStaffUserDetail, asUser } from './UserTable'

export interface Schema {
  accounts: AccountTable
  agentic_feedback: AgenticFeedbackTable
  agentic_conversation_messages: AgenticConversationMessageTable
  agentic_conversations: AgenticConversationTable
  api_keys: ApiKeyTable
  billing_customers: BillingCustomerTable
  billing_events: BillingEventTable
  billing_plan_entitlements: BillingPlanEntitlementTable
  billing_plans: BillingPlanTable
  billing_subscriptions: BillingSubscriptionTable
  feature_gates: FeatureGateTable
  invitations: InvitationTable
  memberships: MembershipTable
  oauth_authorization_codes: OAuthAuthorizationCodeTable
  oauth_clients: OAuthClientTable
  oauth_connections: OAuthConnectionTable
  outbox_jobs: OutboxJobTable
  pm_connections: PmConnectionTable
  password_reset_tokens: PasswordResetTokenTable
  recordings: RecordingTable
  recording_errors: RecordingErrorTable
  recording_event_index: RecordingEventIndexTable
  recording_resources: RecordingResourceTable
  projects: ProjectTable
  project_recordings: ProjectRecordingTable
  sessions: SessionTable
  staff_users: StaffUserTable
  users: UserTable
}

export {
  ApiKeyTable,
  OAuthAuthorizationCodeTable,
  OAuthClientTable,
  OAuthConnectionTable,
  OutboxJobTable,
  PmConnectionTable,
  RecordingErrorTable,
  RecordingEventIndexTable,
  RecordingResourceTable,
  RecordingTable,
  asStaffUser,
  asStaffUserDetail,
  asUser,
}

export type {
  NewRecordingErrorRow,
  RecordingErrorRow,
} from './RecordingErrorTable'

export type {
  OutboxJobRow,
  OutboxJson,
  OutboxLastError,
} from './OutboxJobTable'
