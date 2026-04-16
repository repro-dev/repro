import { Card, PageFrame, Table } from '@repro/design'
import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import { useStaffAccounts } from '~/hooks'

export const AccountsRoute: React.FC = () => {
  const [search, setSearch] = useState('')
  const { accounts, isLoading, error } = useStaffAccounts({ search })

  return (
    <PageFrame>
      <PageFrame.Header>
        <PageFrame.Title>Accounts</PageFrame.Title>
      </PageFrame.Header>
      <PageFrame.Body>
        <div style={{ marginBottom: 16 }}>
          <Card padding={16}>
            <input
              type="text"
              placeholder="Search by name or email..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ width: '100%' }}
            />
          </Card>
        </div>
        {isLoading && <p>Loading...</p>}
        {error && <p>Error loading accounts</p>}
        {!isLoading && !error && (
          <Table>
            <Table.Header>
              <Table.Row>
                <Table.HeaderCell>Name</Table.HeaderCell>
                <Table.HeaderCell>Email</Table.HeaderCell>
                <Table.HeaderCell>Plan</Table.HeaderCell>
                <Table.HeaderCell>Users</Table.HeaderCell>
                <Table.HeaderCell>Recordings</Table.HeaderCell>
                <Table.HeaderCell>Created</Table.HeaderCell>
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {accounts.map(account => (
                <Table.Row key={account.id}>
                  <Table.Cell>
                    <Link to={`/accounts/${account.id}`}>{account.name}</Link>
                  </Table.Cell>
                  <Table.Cell>{account.email}</Table.Cell>
                  <Table.Cell>{account.plan ?? '—'}</Table.Cell>
                  <Table.Cell>{account.userCount}</Table.Cell>
                  <Table.Cell>{account.recordingCount}</Table.Cell>
                  <Table.Cell>
                    {new Date(account.createdAt).toLocaleDateString()}
                  </Table.Cell>
                </Table.Row>
              ))}
              {accounts.length === 0 && (
                <Table.Row>
                  <Table.Cell colSpan={6}>No accounts found</Table.Cell>
                </Table.Row>
              )}
            </Table.Body>
          </Table>
        )}
      </PageFrame.Body>
    </PageFrame>
  )
}
