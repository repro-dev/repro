export interface Account {
  id: string
  name: string
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
