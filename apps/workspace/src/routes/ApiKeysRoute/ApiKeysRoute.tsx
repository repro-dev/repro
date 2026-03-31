import { Block, Col, Row } from '@jsxstyle/react'
import { useApiClient } from '@repro/api-client'
import {
  Alert,
  Button,
  EmptyState,
  FormField,
  FormFieldError,
  FullPageError,
  FullPageLoading,
  Input,
  Label,
  Modal,
  PageFrame,
  Stack,
  Table,
  Text,
  color,
  spacing,
} from '@repro/design'
import { ListResponse } from '@repro/domain'
import { useFuture } from '@repro/future-utils'
import { fork } from 'fluture'
import {
  CheckIcon,
  ClipboardIcon,
  KeyIcon,
  PlusIcon,
  TrashIcon,
} from 'lucide-react'
import React, { useCallback, useState } from 'react'
import { useForm } from 'react-hook-form'

interface ApiKey {
  id: string
  name: string
  keyPrefix: string
  scopes: string[]
  lastUsedAt: string | null
  expiresAt: string | null
  revokedAt: string | null
  createdAt: string
}

interface CreateApiKeyResponse {
  id: string
  key: string
  prefix: string
  name: string
  scopes: string[]
  createdAt: string
}

interface CreateApiKeyForm {
  name: string
}

export const ApiKeysRoute: React.FC = () => {
  const apiClient = useApiClient()
  const [refreshKey, setRefreshKey] = useState(0)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [newKeyValue, setNewKeyValue] = useState<string | null>(null)
  const [createError, setCreateError] = useState<string | null>(null)
  const [revokeError, setRevokeError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const { loading, error, data } = useFuture(
    () => apiClient.fetch<ListResponse<ApiKey>>('/account/api-keys'),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [apiClient, refreshKey]
  )

  const {
    register,
    handleSubmit,
    reset: resetForm,
    formState: { errors, isSubmitting },
  } = useForm<CreateApiKeyForm>()

  const handleOpenCreate = useCallback(() => {
    resetForm()
    setCreateError(null)
    setNewKeyValue(null)
    setShowCreateModal(true)
  }, [resetForm])

  const handleCloseCreate = useCallback(() => {
    setShowCreateModal(false)
    setNewKeyValue(null)
    setCreateError(null)
    resetForm()
  }, [resetForm])

  const handleCreate = useCallback(
    (formData: CreateApiKeyForm) => {
      return new Promise<void>(resolve => {
        apiClient
          .fetch<CreateApiKeyResponse>('/account/api-keys', {
            method: 'POST',
            body: JSON.stringify({ name: formData.name, scopes: [] }),
          })
          .pipe(
            fork<Error>(err => {
              setCreateError(err.message ?? 'Failed to create API key')
              resolve()
            })(result => {
              setNewKeyValue(result.key)
              setRefreshKey(k => k + 1)
              resolve()
            })
          )
      })
    },
    [apiClient]
  )

  const handleRevoke = useCallback(
    (keyId: string) => {
      setRevokeError(null)
      apiClient
        .fetch<void>(`/account/api-keys/${keyId}`, { method: 'DELETE' })
        .pipe(
          fork<Error>(err => {
            setRevokeError(err.message ?? 'Failed to revoke API key')
          })(() => {
            setRefreshKey(k => k + 1)
          })
        )
    },
    [apiClient]
  )

  if (loading) {
    return <FullPageLoading />
  }

  if (error) {
    return (
      <FullPageError
        title="Unable to load API keys"
        description="Something went wrong while loading your API keys. Please try again later."
      />
    )
  }

  const keys = data!.items

  return (
    <PageFrame>
      <PageFrame.Header>
        <Row alignItems="center" justifyContent="space-between" width="100%">
          <PageFrame.Title>API Keys</PageFrame.Title>
          <Button
            variant="contained"
            context="info"
            size="medium"
            onClick={handleOpenCreate}
          >
            <Row alignItems="center" gap={spacing.sm}>
              <PlusIcon size={16} />
              New API Key
            </Row>
          </Button>
        </Row>
      </PageFrame.Header>

      <PageFrame.Body>
        <Stack gap="lg">
          <Text variant="body" color={color.text.muted}>
            Personal access tokens authenticate API requests on your behalf.
            Treat them like passwords — never share them publicly.
          </Text>

          {revokeError && <Alert type="danger">{revokeError}</Alert>}

          {keys.length === 0 ? (
            <EmptyState>
              <EmptyState.Icon>
                <KeyIcon size={40} color={color.text.muted} />
              </EmptyState.Icon>
              <EmptyState.Title>No API keys yet</EmptyState.Title>
              <EmptyState.Description>
                Create an API key to authenticate programmatic API access.
              </EmptyState.Description>
            </EmptyState>
          ) : (
            <Table aria-label="API keys">
              <Table.Header>
                <Table.Row>
                  <Table.HeaderCell>Name</Table.HeaderCell>
                  <Table.HeaderCell>Prefix</Table.HeaderCell>
                  <Table.HeaderCell>Created</Table.HeaderCell>
                  <Table.HeaderCell>Last used</Table.HeaderCell>
                  <Table.HeaderCell>Status</Table.HeaderCell>
                  <Table.HeaderCell>
                    <span aria-hidden="true" />
                  </Table.HeaderCell>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {keys.map(key => (
                  <Table.Row key={key.id}>
                    <Table.Cell>{key.name}</Table.Cell>
                    <Table.Cell>
                      <Text variant="code">{key.keyPrefix}…</Text>
                    </Table.Cell>
                    <Table.Cell>
                      {new Date(key.createdAt).toLocaleDateString()}
                    </Table.Cell>
                    <Table.Cell>
                      {key.lastUsedAt
                        ? new Date(key.lastUsedAt).toLocaleDateString()
                        : '—'}
                    </Table.Cell>
                    <Table.Cell>
                      {key.revokedAt ? (
                        <Text variant="body" color={color.text.muted}>
                          Revoked
                        </Text>
                      ) : (
                        <Text variant="body" color={color.success}>
                          Active
                        </Text>
                      )}
                    </Table.Cell>
                    <Table.Cell>
                      {!key.revokedAt && (
                        <Button
                          variant="text"
                          context="danger"
                          size="small"
                          onClick={() => handleRevoke(key.id)}
                        >
                          <Row alignItems="center" gap={spacing.xs}>
                            <TrashIcon size={14} />
                            Revoke
                          </Row>
                        </Button>
                      )}
                    </Table.Cell>
                  </Table.Row>
                ))}
              </Table.Body>
            </Table>
          )}
        </Stack>
      </PageFrame.Body>

      {showCreateModal && (
        <Modal
          width={480}
          height="auto"
          minHeight={280}
          onClose={newKeyValue ? undefined : handleCloseCreate}
          labelId="create-api-key-title"
        >
          <Col padding={spacing['2xl']} gap={spacing.xl}>
            <h2 id="create-api-key-title">
              <Text variant="heading2">Create API Key</Text>
            </h2>

            {newKeyValue ? (
              // Show the key once after creation — never shown again
              <Stack gap="lg">
                <Alert type="success">
                  Your new API key has been created. Copy it now — you
                  won&apos;t be able to see it again.
                </Alert>

                <FormField>
                  <Label>Your new API key</Label>
                  <Row alignItems="center" gap={spacing.sm}>
                    <Block flexGrow={1}>
                      <Input
                        value={newKeyValue}
                        readOnly
                        onClick={e => (e.target as HTMLInputElement).select()}
                      />
                    </Block>
                    <Button
                      variant="outlined"
                      context="neutral"
                      size="medium"
                      onClick={() => {
                        navigator.clipboard.writeText(newKeyValue)
                        setCopied(true)
                        setTimeout(() => setCopied(false), 2000)
                      }}
                    >
                      {copied ? (
                        <CheckIcon size={16} />
                      ) : (
                        <ClipboardIcon size={16} />
                      )}
                    </Button>
                  </Row>
                </FormField>

                <Row justifyContent="flex-end">
                  <Button
                    variant="contained"
                    context="neutral"
                    onClick={handleCloseCreate}
                  >
                    Done
                  </Button>
                </Row>
              </Stack>
            ) : (
              <form onSubmit={handleSubmit(handleCreate)}>
                <Stack gap="lg">
                  {createError && <Alert type="danger">{createError}</Alert>}

                  <FormField>
                    <Label>Name</Label>
                    <Input
                      context={errors.name ? 'error' : 'normal'}
                      placeholder="e.g. CI/CD pipeline"
                      {...register('name', {
                        required: 'A name is required',
                        maxLength: {
                          value: 255,
                          message: 'Name must be at most 255 characters',
                        },
                      })}
                    />
                    {errors.name && <FormFieldError error={errors.name} />}
                  </FormField>

                  <Row justifyContent="flex-end" gap={spacing.md}>
                    <Button
                      variant="outlined"
                      context="neutral"
                      type="button"
                      onClick={handleCloseCreate}
                    >
                      Cancel
                    </Button>
                    <Button
                      variant="contained"
                      context="info"
                      type="submit"
                      disabled={isSubmitting}
                    >
                      Create
                    </Button>
                  </Row>
                </Stack>
              </form>
            )}
          </Col>
        </Modal>
      )}
    </PageFrame>
  )
}
