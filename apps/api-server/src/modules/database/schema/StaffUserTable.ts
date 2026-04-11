import { StaffUser } from '@repro/domain'
import { Generated, GeneratedAlways, Selectable } from 'kysely'
import { encodeId } from '../helpers'

export interface StaffUserTable {
  id: GeneratedAlways<number>
  name: string
  email: string
  password: string
  active: Generated<boolean>
  admin: Generated<boolean>
  failedLoginCount: Generated<number>
  lockedUntil: Date | null
  createdAt: GeneratedAlways<Date>
}

type DomainObject = Pick<Selectable<StaffUserTable>, 'id' | 'name' | 'email'>

export function asStaffUser<T extends DomainObject>(values: T): StaffUser {
  return {
    type: 'staff',
    id: encodeId(values.id),
    name: values.name,
    email: values.email,
  }
}
