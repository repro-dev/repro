export interface Account {
  id: string
  name: string
}

// Staff/admin account view — lastActiveAt is the canonical activity signal
// and must never fall back to account creation timestamps.
export interface StaffAccount extends Account {
  lastActiveAt: string | null
}

export interface Invitation {
  id: string
  token: string
  email: string
}

export interface User {
  type: 'user'
  id: string
  name: string
  email: string
  verified: boolean
  admin?: boolean
}

export type RecordingPrivacyPreset = 'strict' | 'standard' | 'off'

export interface AccountSettingsSummary {
  id: string
  name: string
  createdAt: string
  userCount: number
  projectCount: number
  users: Array<{
    id: string
    name: string
    email: string
    admin: boolean
  }>
  projects: Array<{
    id: string
    name: string
  }>
  additionalUserCount: number
  additionalProjectCount: number
  recordingPrivacyPreset: RecordingPrivacyPreset
}

export type AccountPlanTier = 'Free' | 'Repro+' | 'Repro++'

export interface StaffAccountPrimaryUser {
  id: string
  name: string
  email: string
  verified: boolean
  admin: boolean
  active: boolean
}

export interface StaffAccountListItem {
  id: string
  name: string
  createdAt: string
  active: boolean
  primaryEmail: string | null
  planName: string | null
  subscriptionStatus: string | null
  recordingCount: number
  userCount: number
  projectCount: number
  lastActiveAt: string | null
}

export interface StaffAccountDetail extends StaffAccountListItem {
  primaryUser: StaffAccountPrimaryUser | null
}

export interface StaffAccountProject {
  id: string
  name: string
  active: boolean
  createdAt: string
  recordingCount: number
}

// Staff-facing view of a user — includes email for administrative purposes
export interface StaffUserDetail {
  type: 'user'
  id: string
  name: string
  email: string
  verified: boolean
  admin: boolean
  active: boolean
  accountId: string
  createdAt: string
}

export interface StaffUser {
  type: 'staff'
  id: string
  name: string
  email: string
  isAdmin: boolean
  isActive: boolean
}

export interface UserProfile {
  type: 'user'
  id: string
  name: string
  email: string
  verified: boolean
  createdAt: string
  account: Account
}

export interface Session {
  id: string
  sessionToken: string
  subjectId: string
  subjectType: 'user' | 'staff'
  createdAt: string
  revoked?: boolean
}
