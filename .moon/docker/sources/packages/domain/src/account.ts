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

export interface StaffUser {
  type: 'staff'
  id: string
  name: string
  email: string
}

export interface Session {
  id: string
  sessionToken: string
  subjectId: string
  subjectType: 'user' | 'staff'
  createdAt: string
  revoked?: boolean
}
