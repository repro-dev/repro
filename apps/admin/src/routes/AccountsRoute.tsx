import { Card, PageFrame, Table } from '@repro/design'
import { AccountPlan } from '@repro/domain'
import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import { useStaffAccounts } from '~/hooks'

function formatDate(value: string | null) {
  return value ? new Date(value).toLocaleDateString() : 'Never'
}

export const AccountsRoute: React.FC = () => {
  const [search, setSearch] = useState('')
  const [plan, setPlan] = useState<AccountPlan | ''>('')
  const [cursor, setCursor] = useState<string | undefined>()
  const [previousCursors, setPreviousCursors] = useState<
    Array<string | undefined>
  >([])

  const { accounts, nextCursor, isLoading, error } = useStaffAccounts({
    cursor,
    search: search || undefined,
    plan: plan || undefined,
  })

  const resetPagination = () => {
    setCursor(undefined)
    setPreviousCursors([])
  }

  const handleNextPage = () => {
    if (!nextCursor) return

    setPreviousCursors(previous => [...previous, cursor])
    setCursor(nextCursor)
  }

  const handlePreviousPage = () => {
    setPreviousCursors(previous => {
      const nextPrevious = [...previous]
      const previousCursor = nextPrevious.pop()
      setCursor(previousCursor)
      return nextPrevious
    })
  }

  return (
    <PageFrame>
      <PageFrame.Header>
        <PageFrame.Title>Accounts</PageFrame.Title>
      </PageFrame.Header>
      <PageFrame.Body>
        <div style={{ marginBottom: 16 }}>
          <Card padding={16}>
            <div
              style={{
                display: 'grid',
                gap: 12,
                gridTemplateColumns: 'minmax(0, 1fr) minmax(180px, 240px)',
              }}
            >
              <input
                type="text"
                placeholder="Search by email or account ID..."
                value={search}
                onChange={event => {
                  setSearch(event.target.value)
                  resetPagination()
                }}
                style={{ width: '100%' }}
              />
              <select
                value={plan}
                onChange={event => {
                  setPlan(event.target.value as AccountPlan | '')
                  resetPagination()
                }}
              >
                <option value="">All plans</option>
                <option value="free">Free</option>
                <option value="starter">Starter</option>
                <option value="pro">Pro</option>
                <option value="enterprise">Enterprise</option>
              </select>
            </div>
          </Card>
        </div>
        {isLoading && <p>Loading accounts...</p>}
        {error && (
          <p>
            Failed to load accounts. The request may have failed. Refresh the
            page and try again.
          </p>
        )}
        {!isLoading && !error && (
          <>
            <Table>
              <Table.Header>
                <Table.Row>
                  <Table.HeaderCell>Name</Table.HeaderCell>
                  <Table.HeaderCell>Email</Table.HeaderCell>
                  <Table.HeaderCell>Plan</Table.HeaderCell>
                  <Table.HeaderCell>Users</Table.HeaderCell>
                  <Table.HeaderCell>Recordings</Table.HeaderCell>
                  <Table.HeaderCell>Created</Table.HeaderCell>
                  <Table.HeaderCell>Last Active</Table.HeaderCell>
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
                    <Table.Cell>{formatDate(account.createdAt)}</Table.Cell>
                    <Table.Cell>{formatDate(account.lastActiveAt)}</Table.Cell>
                  </Table.Row>
                ))}
                {accounts.length === 0 && (
                  <Table.Row>
                    <Table.Cell colSpan={7}>No accounts found</Table.Cell>
                  </Table.Row>
                )}
              </Table.Body>
            </Table>

            {(previousCursors.length > 0 || nextCursor) && (
              <div
                style={{
                  alignItems: 'center',
                  display: 'flex',
                  gap: 12,
                  justifyContent: 'flex-end',
                  marginTop: 16,
                }}
              >
                <button
                  disabled={previousCursors.length === 0}
                  onClick={handlePreviousPage}
                  type="button"
                >
                  Previous
                </button>
                <span>Page {previousCursors.length + 1}</span>
                <button
                  disabled={!nextCursor}
                  onClick={handleNextPage}
                  type="button"
                >
                  Next
                </button>
              </div>
            )}
          </>
        )}
      </PageFrame.Body>
    </PageFrame>
  )
}
