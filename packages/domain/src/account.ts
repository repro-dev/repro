export interface Account {
  id: string
  name: string
}

export type AccountPlan = 'free' | 'starter' | 'pro' | 'enterprise'

// Staff-facing view of an account with enriched metadata
export interface StaffAccount {
  id: string
  name: string
  email: string
  plan: AccountPlan | null
  createdAt: string
  lastActiveAt: string | null
  userCount: number
  recordingCount: number
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
  verified: boolean
}

// Staff-facing view of a user — includes email for administrative purposes
export interface StaffUserDetail {
  type: 'user'
  id: string
  name: string
  email: string
  verified: boolean
}

export interface StaffUser {
  type: 'staff'
  id: string
  name: string
  email: string
  isAdmin: boolean
}

export interface Session {
  id: string
  sessionToken: string
  subjectId: string
  subjectType: 'user' | 'staff'
  createdAt: string
  revoked?: boolean
}
