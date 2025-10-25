import { User } from '@repro/domain'
import { GeneratedAlways, Selectable } from 'kysely'
import { encodeId } from '../helpers'

export interface UserTable {
  id: GeneratedAlways<number>
  accountId: number
  name: string
  email: string
  password: string
  verificationToken: string
  verified: number | null
  active: number | null
  admin: number | null
  createdAt: GeneratedAlways<Date>
}

type DomainObject = Pick<Selectable<UserTable>, 'id' | 'name' | 'verified'>

export function asUser<T extends DomainObject>(values: T): User {
  return {
    type: 'user',
    id: encodeId(values.id),
    name: values.name,
    verified: !!values.verified,
  }
}
