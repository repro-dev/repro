import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export type AuthVaultBootstrapTarget = 'users' | 'staff_users'

export type AuthVaultBootstrapService = 'workspace' | 'admin'

export type AuthVaultBootstrapLogin = {
  profile: string
  service: AuthVaultBootstrapService
  username: string
  target: AuthVaultBootstrapTarget
  name: string
  account?: 'acme' | 'beta'
  verified?: boolean
  active: boolean
  admin: boolean
  verificationToken?: string
}

export type AuthVaultBootstrap = {
  password: string
  logins: AuthVaultBootstrapLogin[]
}

const migrationsDir = dirname(fileURLToPath(import.meta.url))

export const authVaultBootstrapPath = resolve(
  migrationsDir,
  '../../../../scripts/lib/data/auth-vault-bootstrap.json'
)

function assertLogin(login: Partial<AuthVaultBootstrapLogin>, index: number) {
  const requiredStrings = [
    'profile',
    'service',
    'username',
    'target',
    'name',
  ] as const

  for (const key of requiredStrings) {
    const value = login[key]

    if (typeof value !== 'string' || value.length === 0) {
      throw new Error(
        `Invalid auth vault bootstrap login at index ${index}: missing ${key}`
      )
    }
  }

  if (login.service !== 'workspace' && login.service !== 'admin') {
    throw new Error(
      `Invalid auth vault bootstrap login at index ${index}: bad service`
    )
  }

  if (login.target !== 'users' && login.target !== 'staff_users') {
    throw new Error(
      `Invalid auth vault bootstrap login at index ${index}: bad target`
    )
  }

  if (login.target === 'users') {
    if (typeof login.account !== 'string' || login.account.length === 0) {
      throw new Error(
        `Invalid auth vault bootstrap login at index ${index}: missing account`
      )
    }

    if (typeof login.verified !== 'boolean') {
      throw new Error(
        `Invalid auth vault bootstrap login at index ${index}: missing verified`
      )
    }

    if (typeof login.verificationToken !== 'string') {
      throw new Error(
        `Invalid auth vault bootstrap login at index ${index}: missing verificationToken`
      )
    }
  }

  if (typeof login.active !== 'boolean' || typeof login.admin !== 'boolean') {
    throw new Error(
      `Invalid auth vault bootstrap login at index ${index}: missing booleans`
    )
  }
}

export function loadAuthVaultBootstrap(): AuthVaultBootstrap {
  const parsed = JSON.parse(
    readFileSync(authVaultBootstrapPath, 'utf8')
  ) as Partial<AuthVaultBootstrap>

  if (typeof parsed.password !== 'string' || parsed.password.length === 0) {
    throw new Error('Invalid auth vault bootstrap: missing password')
  }

  if (!Array.isArray(parsed.logins)) {
    throw new Error('Invalid auth vault bootstrap: missing logins')
  }

  parsed.logins.forEach((login, index) => assertLogin(login, index))

  return parsed as AuthVaultBootstrap
}
