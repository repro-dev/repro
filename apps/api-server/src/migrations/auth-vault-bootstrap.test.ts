import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { loadAuthVaultBootstrap } from './auth-vault-bootstrap'

describe('loadAuthVaultBootstrap', () => {
  it('loads the baked dev auth credentials from the shared data file', () => {
    const { logins, password } = loadAuthVaultBootstrap()

    assert.equal(password, 'password')
    assert.deepEqual(
      logins.map(login => login.profile),
      [
        'acme-admin',
        'acme-member',
        'acme-viewer',
        'beta-admin',
        'beta-unverified',
        'staff',
        'staff-admin',
      ]
    )
    assert.deepEqual(
      logins.map(login => login.username),
      [
        'admin@acme.repro.test',
        'member@acme.repro.test',
        'viewer@acme.repro.test',
        'admin@beta.repro.test',
        'unverified@beta.repro.test',
        'staff@repro.test',
        'staffadmin@repro.test',
      ]
    )
  })
})
