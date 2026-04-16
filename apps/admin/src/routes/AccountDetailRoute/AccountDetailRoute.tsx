import { Card, PageFrame, Table } from '@repro/design'
import React from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  useStaffAccount,
  useStaffAccountProjects,
  useStaffAccountUsers,
} from '~/hooks'

export const AccountDetailRoute: React.FC = () => {
  const { accountId } = useParams()
  const {
    account,
    isLoading: accountLoading,
    error: accountError,
  } = useStaffAccount(accountId!)
  const { users, isLoading: usersLoading } = useStaffAccountUsers(accountId!)
  const { projects, isLoading: projectsLoading } = useStaffAccountProjects(
    accountId!
  )

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
          <p>Created: {new Date(account.createdAt).toLocaleDateString()}</p>
          <p>
            Last Active:{' '}
            {account.lastActiveAt
              ? new Date(account.lastActiveAt).toLocaleDateString()
              : 'Never'}
          </p>
          <p>Users: {account.userCount}</p>
          <p>Recordings: {account.recordingCount}</p>
        </Card>

        <div style={{ marginBottom: 24 }}>
          <Card padding={16}>
            <h3 style={{ marginTop: 0 }}>Users ({users.length})</h3>
            {usersLoading ? (
              <p>Loading users...</p>
            ) : (
              <Table>
                <Table.Header>
                  <Table.Row>
                    <Table.HeaderCell>Name</Table.HeaderCell>
                    <Table.HeaderCell>Email</Table.HeaderCell>
                    <Table.HeaderCell>Verified</Table.HeaderCell>
                  </Table.Row>
                </Table.Header>
                <Table.Body>
                  {users.map(user => (
                    <Table.Row key={user.id}>
                      <Table.Cell>{user.name}</Table.Cell>
                      <Table.Cell>{user.email}</Table.Cell>
                      <Table.Cell>{user.verified ? 'Yes' : 'No'}</Table.Cell>
                    </Table.Row>
                  ))}
                  {users.length === 0 && (
                    <Table.Row>
                      <Table.Cell colSpan={3}>No users found</Table.Cell>
                    </Table.Row>
                  )}
                </Table.Body>
              </Table>
            )}
          </Card>
        </div>

        <Card padding={16}>
          <h3 style={{ marginTop: 0 }}>Projects ({projects.length})</h3>
          {projectsLoading ? (
            <p>Loading projects...</p>
          ) : (
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
          )}
        </Card>
      </PageFrame.Body>
    </PageFrame>
  )
}
