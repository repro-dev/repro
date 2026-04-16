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
  verified: boolean
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
}

export interface Session {
  id: string
  sessionToken: string
  subjectId: string
  subjectType: 'user' | 'staff'
  createdAt: string
  revoked?: boolean
}
