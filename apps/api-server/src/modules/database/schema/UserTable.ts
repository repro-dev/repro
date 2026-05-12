import { StaffUserDetail, User } from '@repro/domain'
import { Generated, GeneratedAlways, Selectable } from 'kysely'
import { encodeId } from '../helpers'

export interface UserTable {
  id: GeneratedAlways<number>
  accountId: number
  name: string
  email: string
  password: string
  verificationToken: string
  verified: Generated<boolean>
  active: Generated<boolean>
  admin: Generated<boolean>
  failedLoginCount: Generated<number>
  lockedUntil: Date | null
  createdAt: GeneratedAlways<Date>
}

type DomainObject = Pick<
  Selectable<UserTable>,
  'id' | 'name' | 'email' | 'verified'
>
type StaffDomainObject = Pick<
  Selectable<UserTable>,
  | 'id'
  | 'name'
  | 'email'
  | 'verified'
  | 'admin'
  | 'active'
  | 'accountId'
  | 'createdAt'
>

export function asUser<T extends DomainObject>(values: T): User {
  return {
    type: 'user',
    id: encodeId(values.id),
    name: values.name,
    email: values.email,
    verified: values.verified,
  }
}

export function asStaffUserDetail<T extends StaffDomainObject>(
  values: T
): StaffUserDetail {
  return {
    type: 'user',
    id: encodeId(values.id),
    name: values.name,
    email: values.email,
    verified: values.verified,
    admin: values.admin,
    active: values.active,
    accountId: encodeId(values.accountId),
    createdAt: values.createdAt.toISOString(),
  }
}
