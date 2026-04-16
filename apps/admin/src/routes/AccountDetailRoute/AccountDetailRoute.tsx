import { Card, PageFrame, Table } from '@repro/design'
import React, { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  useStaffAccount,
  useStaffAccountProjects,
  useStaffAccountUsers,
} from '~/hooks'

function formatDate(value: string | null) {
  return value ? new Date(value).toLocaleDateString() : 'Never'
}

function formatLabel(value: string) {
  return value
    .split('_')
    .map(part => `${part[0]?.toUpperCase() ?? ''}${part.slice(1)}`)
    .join(' ')
}

export const AccountDetailRoute: React.FC = () => {
  const { accountId } = useParams()
  const resolvedAccountId = accountId ?? ''
  const [userCursor, setUserCursor] = useState<string | undefined>()
  const [previousUserCursors, setPreviousUserCursors] = useState<
    Array<string | undefined>
  >([])
  const [projectCursor, setProjectCursor] = useState<string | undefined>()
  const [previousProjectCursors, setPreviousProjectCursors] = useState<
    Array<string | undefined>
  >([])

  const {
    account,
    isLoading: accountLoading,
    error: accountError,
  } = useStaffAccount(resolvedAccountId)
  const {
    users,
    nextCursor: usersNextCursor,
    isLoading: usersLoading,
    error: usersError,
  } = useStaffAccountUsers(resolvedAccountId, { cursor: userCursor })
  const {
    projects,
    nextCursor: projectsNextCursor,
    isLoading: projectsLoading,
    error: projectsError,
  } = useStaffAccountProjects(resolvedAccountId, { cursor: projectCursor })

  if (!accountId) {
    return (
      <PageFrame>
        <PageFrame.Header>
          <PageFrame.Title>Account Not Found</PageFrame.Title>
        </PageFrame.Header>
        <PageFrame.Body>
          <p>Could not load account details.</p>
          <Link to="/accounts">Back to accounts</Link>
        </PageFrame.Body>
      </PageFrame>
    )
  }

  const handleNextUsersPage = () => {
    if (!usersNextCursor) return

    setPreviousUserCursors(previous => [...previous, userCursor])
    setUserCursor(usersNextCursor)
  }

  const handlePreviousUsersPage = () => {
    setPreviousUserCursors(previous => {
      const nextPrevious = [...previous]
      const previousCursor = nextPrevious.pop()
      setUserCursor(previousCursor)
      return nextPrevious
    })
  }

  const handleNextProjectsPage = () => {
    if (!projectsNextCursor) return

    setPreviousProjectCursors(previous => [...previous, projectCursor])
    setProjectCursor(projectsNextCursor)
  }

  const handlePreviousProjectsPage = () => {
    setPreviousProjectCursors(previous => {
      const nextPrevious = [...previous]
      const previousCursor = nextPrevious.pop()
      setProjectCursor(previousCursor)
      return nextPrevious
    })
  }

  if (accountLoading) {
    return (
      <PageFrame>
        <PageFrame.Header>
          <PageFrame.Title>Loading...</PageFrame.Title>
        </PageFrame.Header>
      </PageFrame>
    )
  }

  if (accountError || !account) {
    return (
      <PageFrame>
        <PageFrame.Header>
          <PageFrame.Title>Account Not Found</PageFrame.Title>
        </PageFrame.Header>
        <PageFrame.Body>
          <p>Could not load account details.</p>
          <Link to="/accounts">Back to accounts</Link>
        </PageFrame.Body>
      </PageFrame>
    )
  }

  return (
    <PageFrame>
      <PageFrame.Header>
        <PageFrame.Title>{account.name}</PageFrame.Title>
      </PageFrame.Header>
      <PageFrame.Body>
        <div style={{ marginBottom: 24 }}>
          <Link to="/accounts">← Back to accounts</Link>
        </div>

        <Card padding={16}>
          <h3 style={{ marginTop: 0 }}>Account Details</h3>
          <p>Email: {account.email}</p>
          <p>Plan: {account.plan ?? '—'}</p>
          <p>
            Subscription Status:{' '}
            {account.subscriptionStatus
              ? formatLabel(account.subscriptionStatus)
              : '—'}
          </p>
          <p>Account Status: {account.active ? 'Active' : 'Inactive'}</p>
          <p>Created: {formatDate(account.createdAt)}</p>
          <p>Last Active: {formatDate(account.lastActiveAt)}</p>
          <p>Users: {account.userCount}</p>
          <p>Recordings: {account.recordingCount}</p>
        </Card>

        <div style={{ marginBottom: 24 }}>
          <Card padding={16}>
            <h3 style={{ marginTop: 0 }}>Users ({account.userCount})</h3>
            {usersLoading ? (
              <p>Loading users...</p>
            ) : usersError ? (
              <p>
                Failed to load users. The request may have failed. Refresh the
                page and try again.
              </p>
            ) : (
              <>
                <Table>
                  <Table.Header>
                    <Table.Row>
                      <Table.HeaderCell>Name</Table.HeaderCell>
                      <Table.HeaderCell>Email</Table.HeaderCell>
                      <Table.HeaderCell>Verified</Table.HeaderCell>
                      <Table.HeaderCell>Admin</Table.HeaderCell>
                      <Table.HeaderCell>Active</Table.HeaderCell>
                    </Table.Row>
                  </Table.Header>
                  <Table.Body>
                    {users.map(user => (
                      <Table.Row key={user.id}>
                        <Table.Cell>{user.name}</Table.Cell>
                        <Table.Cell>{user.email}</Table.Cell>
                        <Table.Cell>{user.verified ? 'Yes' : 'No'}</Table.Cell>
                        <Table.Cell>{user.isAdmin ? 'Yes' : 'No'}</Table.Cell>
                        <Table.Cell>{user.active ? 'Yes' : 'No'}</Table.Cell>
                      </Table.Row>
                    ))}
                    {users.length === 0 && (
                      <Table.Row>
                        <Table.Cell colSpan={5}>No users found</Table.Cell>
                      </Table.Row>
                    )}
                  </Table.Body>
                </Table>

                {(previousUserCursors.length > 0 || usersNextCursor) && (
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
                      disabled={previousUserCursors.length === 0}
                      onClick={handlePreviousUsersPage}
                      type="button"
                    >
                      Previous
                    </button>
                    <span>Page {previousUserCursors.length + 1}</span>
                    <button
                      disabled={!usersNextCursor}
                      onClick={handleNextUsersPage}
                      type="button"
                    >
                      Next
                    </button>
                  </div>
                )}
              </>
            )}
          </Card>
        </div>

        <Card padding={16}>
          <h3 style={{ marginTop: 0 }}>Projects</h3>
          {projectsLoading ? (
            <p>Loading projects...</p>
          ) : projectsError ? (
            <p>
              Failed to load projects. The request may have failed. Refresh the
              page and try again.
            </p>
          ) : (
            <>
              <Table>
                <Table.Header>
                  <Table.Row>
                    <Table.HeaderCell>Name</Table.HeaderCell>
                  </Table.Row>
                </Table.Header>
                <Table.Body>
                  {projects.map(project => (
                    <Table.Row key={project.id}>
                      <Table.Cell>{project.name}</Table.Cell>
                    </Table.Row>
                  ))}
                  {projects.length === 0 && (
                    <Table.Row>
                      <Table.Cell>No projects found</Table.Cell>
                    </Table.Row>
                  )}
                </Table.Body>
              </Table>
              {(previousProjectCursors.length > 0 || projectsNextCursor) && (
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
                    disabled={previousProjectCursors.length === 0}
                    onClick={handlePreviousProjectsPage}
                    type="button"
                  >
                    Previous
                  </button>
                  <span>Page {previousProjectCursors.length + 1}</span>
                  <button
                    disabled={!projectsNextCursor}
                    onClick={handleNextProjectsPage}
                    type="button"
                  >
                    Next
                  </button>
                </div>
              )}
            </>
          )}
        </Card>
      </PageFrame.Body>
    </PageFrame>
  )
}
