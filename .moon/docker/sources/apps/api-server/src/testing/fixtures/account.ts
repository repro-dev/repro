import { Account, Session, StaffUser, User } from '@repro/domain'
import { tapF } from '@repro/future-utils'
import { Fixture } from '../types'

export const AccountA: Fixture<Account> = {
  dependencies: [],
  load: ({ accountService }) => accountService.createAccount('Account A'),
}

export const AccountB: Fixture<Account> = {
  dependencies: [],
  load: ({ accountService }) => accountService.createAccount('Account B'),
}

export const UserA: Fixture<User> = {
  dependencies: [AccountA],
  load: ({ accountService }, account: Account) =>
    accountService.createUser(
      account.id,
      'User A',
      'user-a@example.com',
      'password-a'
    ),
}

export const UserA_Session: Fixture<Session> = {
  dependencies: [UserA],
  load: ({ accountService }, user: User) =>
    accountService.createSession(user.id, 'user'),
}

export const UserB: Fixture<User> = {
  dependencies: [AccountA],
  load: ({ accountService }, account: Account) =>
    accountService.createUser(
      account.id,
      'User B',
      'user-b@example.com',
      'password-b'
    ),
}

export const UserB_Session: Fixture<Session> = {
  dependencies: [UserB],
  load: ({ accountService }, user: User) =>
    accountService.createSession(user.id, 'user'),
}

export const UserC: Fixture<User> = {
  dependencies: [AccountA],
  load: ({ accountService }, account: Account) =>
    accountService.createUser(
      account.id,
      'User C',
      'user-c@example.com',
      'password-c'
    ),
}

export const UserC_Session: Fixture<Session> = {
  dependencies: [UserC],
  load: ({ accountService }, user: User) =>
    accountService.createSession(user.id, 'user'),
}

export const UserD_AccountB: Fixture<User> = {
  dependencies: [AccountB],
  load: ({ accountService }, account: Account) =>
    accountService.createUser(
      account.id,
      'User D',
      'user-d@example.com',
      'password-d'
    ),
}

export const UserD_Session: Fixture<Session> = {
  dependencies: [UserD_AccountB],
  load: ({ accountService }, user: User) =>
    accountService.createSession(user.id, 'user'),
}

export const AdminUserA: Fixture<User> = {
  dependencies: [AccountA],
  load: ({ accountService }, account: Account) =>
    accountService
      .createUser(
        account.id,
        'Admin User A',
        'admin-user-a@example.com',
        'admin-password-a'
      )
      .pipe(tapF(user => accountService.setUserIsAdmin(user.id, true))),
}

export const AdminUserA_Session: Fixture<Session> = {
  dependencies: [AdminUserA],
  load: ({ accountService }, user: User) =>
    accountService.createSession(user.id, 'user'),
}

export const StaffUserA: Fixture<StaffUser> = {
  dependencies: [],
  load: ({ accountService }) =>
    accountService.createStaffUser(
      'Staff User',
      'staff-user@repro.test',
      'staff-user-password'
    ),
}

export const StaffUserA_Session: Fixture<Session> = {
  dependencies: [StaffUserA],
  load: ({ accountService }, user: StaffUser) =>
    accountService.createSession(user.id, 'staff'),
}
