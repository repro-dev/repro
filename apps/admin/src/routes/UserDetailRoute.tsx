import { Block as JsxBlock } from '@jsxstyle/react'
import { useApiClient } from '@repro/api-client'
import {
  Alert,
  Button,
  Card,
  DefinitionList,
  FullPageError,
  FullPageLoading,
  Link,
  PageFrame,
  Table,
  Toggle,
} from '@repro/design'
import { StaffUserDetail, UserProjectMembership } from '@repro/domain'
import { useFuture } from '@repro/future-utils'
import React, { useState } from 'react'
import { Link as RouterLink, useNavigate, useParams } from 'react-router-dom'
import { DeactivateUserDialog } from './UserDetailRoute/DeactivateUserDialog'

export const UserDetailRoute: React.FC = () => {
  const { userId } = useParams<{ userId: string }>()
  const navigate = useNavigate()
  const apiClient = useApiClient()

  const userResult = useFuture(
    () => apiClient.fetch<StaffUserDetail>(`/staff/users/${userId}`),
    [userId]
  )

  const projectsResult = useFuture(
    () =>
      apiClient.fetch<Array<UserProjectMembership>>(
        `/staff/users/${userId}/projects`
      ),
    [userId]
  )

  const [showDeactivateDialog, setShowDeactivateDialog] = useState(false)

  if (userResult.loading) {
    return <FullPageLoading />
  }

  if (userResult.error) {
    return (
      <FullPageError
        title="Failed to load user"
        description={userResult.error.message}
      />
    )
  }

  const user = userResult.data

  const handleToggleAdmin = async () => {
    await apiClient.fetch(`/staff/users/${userId}`, {
      method: 'PATCH',
      body: JSON.stringify({ isAdmin: !user.admin }),
      headers: { 'Content-Type': 'application/json' },
    })
    // Refetch user data
    window.location.reload()
  }

  const handleDeactivate = async () => {
    await apiClient.fetch(`/staff/users/${userId}`, {
      method: 'PATCH',
      body: JSON.stringify({ isActive: false }),
      headers: { 'Content-Type': 'application/json' },
    })
    // Navigate back to account
    navigate(`/accounts/${user.accountId}`)
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })
  }

  return (
    <PageFrame>
      <PageFrame.Header>
        <PageFrame.Title>{user.name}</PageFrame.Title>
        <Link
          component={RouterLink}
          props={{ to: `/accounts/${user.accountId}` }}
        >
          &larr; Back to account
        </Link>
      </PageFrame.Header>
      <PageFrame.Body>
        <Card>
          <DefinitionList
            title="User Information"
            pairs={[
              ['Email', user.email],
              ['Verified', user.verified ? 'Yes' : 'No'],
              [
                'Admin',
                <Toggle
                  label="Admin"
                  checked={user.admin}
                  onChange={handleToggleAdmin}
                />,
              ],
              ['Status', user.active ? 'Active' : 'Deactivated'],
              ['Created', formatDate(user.createdAt)],
            ]}
          />
          {!user.active && (
            <Alert type="warning">This user has been deactivated.</Alert>
          )}
          {user.active && (
            <JsxBlock marginTop={16}>
              <Button
                variant="outlined"
                context="danger"
                onClick={() => setShowDeactivateDialog(true)}
              >
                Deactivate User
              </Button>
            </JsxBlock>
          )}
        </Card>
        <JsxBlock marginTop={16}>
          <Card>
            <JsxBlock fontWeight={500} marginBottom={12}>
              Project Memberships ({projectsResult.data?.length ?? 0})
            </JsxBlock>
            {projectsResult.loading ? (
              <JsxBlock color="muted">Loading...</JsxBlock>
            ) : projectsResult.data?.length === 0 ? (
              <JsxBlock color="muted">No project memberships.</JsxBlock>
            ) : (
              <Table>
                <Table.Header>
                  <Table.Row>
                    <Table.HeaderCell>Project</Table.HeaderCell>
                    <Table.HeaderCell>Role</Table.HeaderCell>
                  </Table.Row>
                </Table.Header>
                <Table.Body>
                  {projectsResult.data?.map(m => (
                    <Table.Row key={m.project.id}>
                      <Table.Cell>{m.project.name}</Table.Cell>
                      <Table.Cell>{m.role}</Table.Cell>
                    </Table.Row>
                  ))}
                </Table.Body>
              </Table>
            )}
          </Card>
        </JsxBlock>
      </PageFrame.Body>
      {showDeactivateDialog && (
        <DeactivateUserDialog
          userName={user.name}
          onConfirm={handleDeactivate}
          onClose={() => setShowDeactivateDialog(false)}
        />
      )}
    </PageFrame>
  )
}
