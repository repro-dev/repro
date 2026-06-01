import { Col, Inline, Row } from '@jsxstyle/react'
import { useApiClient } from '@repro/api-client'
import { useSession, useSessionLoading } from '@repro/auth'
import {
  Alert,
  Button,
  Card,
  FullPageLoading,
  PageFrame,
  Radio,
  RadioGroup,
  Stack,
  Text,
  color,
  radius,
  spacing,
  textStyles,
} from '@repro/design'
import { RecordingPrivacyPreset } from '@repro/domain'
import { useFuture } from '@repro/future-utils'
import {
  getRecordingPrivacyPreset as defaultGetRecordingPrivacyPreset,
  updateRecordingPrivacyPreset as defaultUpdateRecordingPrivacyPreset,
} from '@repro/workspace-api'
import { fork } from 'fluture'
import React, { useCallback, useState } from 'react'
import { Navigate } from 'react-router-dom'

type PresetInfo = {
  value: RecordingPrivacyPreset
  label: string
  description: string
}

const PRESET_OPTIONS: Array<PresetInfo> = [
  {
    value: 'strict',
    label: 'Strict',
    description:
      'Masks all input elements and images by default on every recorded page. No page data is captured without explicit opt-in via .repro-ignore.',
  },
  {
    value: 'standard',
    label: 'Standard',
    description:
      'Respects .repro-ignore (exclude element) and .repro-mask (mask contents) CSS classes on recorded pages. Note: .repro-mask is planned but not yet active.',
  },
  {
    value: 'off',
    label: 'Off',
    description:
      'No privacy filtering. All page content is recorded as-is. Only use for public-facing demos or internal tools with no sensitive data.',
  },
]

interface RecordingPrivacySettingsRouteProps {
  getPreset?: typeof defaultGetRecordingPrivacyPreset
  updatePreset?: typeof defaultUpdateRecordingPrivacyPreset
}

export function RecordingPrivacySettingsRoute({
  getPreset = defaultGetRecordingPrivacyPreset,
  updatePreset = defaultUpdateRecordingPrivacyPreset,
}: RecordingPrivacySettingsRouteProps) {
  const apiClient = useApiClient()

  const [refreshKey, setRefreshKey] = useState(0)
  const [selectedPreset, setSelectedPreset] = useState<
    RecordingPrivacyPreset | undefined
  >(undefined)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const {
    loading,
    data: response,
    error,
  } = useFuture(() => getPreset(apiClient), [apiClient, getPreset, refreshKey])

  const savedPreset = response?.preset

  React.useEffect(() => {
    if (savedPreset != null && selectedPreset == null) {
      setSelectedPreset(savedPreset)
    }
  }, [savedPreset, selectedPreset])

  const hasUnsavedChanges =
    savedPreset != null && selectedPreset !== savedPreset
  const effectivePreset = selectedPreset ?? savedPreset

  const handleSelect = useCallback(
    (preset: string) => {
      setSelectedPreset(preset as RecordingPrivacyPreset)
      if (saveError != null) {
        setSaveError(null)
      }
    },
    [saveError]
  )

  const handleSave = useCallback(() => {
    if (selectedPreset == null) {
      return
    }

    setSaveError(null)
    setSaving(true)

    updatePreset(apiClient, selectedPreset).pipe(
      fork(() => {
        setSaveError(
          'Failed to save the privacy setting. The server may be unavailable; try again.'
        )
        setSaving(false)
      })(() => {
        setSaving(false)
        setRefreshKey(key => key + 1)
      })
    )
  }, [apiClient, selectedPreset, updatePreset])

  const handleCancel = useCallback(() => {
    if (savedPreset != null) {
      setSelectedPreset(savedPreset)
    }
    setSaveError(null)
  }, [savedPreset])

  if (loading) {
    return <FullPageLoading />
  }

  if (error) {
    return (
      <PageFrame>
        <PageFrame.Header>
          <PageFrame.Title>Recording Privacy</PageFrame.Title>
        </PageFrame.Header>
        <PageFrame.Body maxWidth={720}>
          <Alert type="danger">
            Failed to load recording privacy settings. Please refresh the page
            and try again.
          </Alert>
        </PageFrame.Body>
      </PageFrame>
    )
  }

  return (
    <PageFrame>
      <PageFrame.Header>
        <PageFrame.Title>Recording Privacy</PageFrame.Title>
      </PageFrame.Header>

      <PageFrame.Body maxWidth={720}>
        <Stack gap="lg">
          {/* Default Privacy Preset section */}
          <Col gap={spacing.md}>
            <Col gap={spacing.xs}>
              <Text variant="heading2">Default Privacy Preset</Text>
              <Text variant="bodySmall" color={color.text.muted}>
                Choose the default privacy level for new recordings in this
                workspace.
              </Text>
            </Col>

            <Card>
              <Col padding={spacing.xl} gap={spacing.lg}>
                <RadioGroup
                  label="Privacy preset"
                  value={effectivePreset ?? 'standard'}
                  onChange={handleSelect}
                  disabled={saving}
                >
                  {PRESET_OPTIONS.map(option => (
                    <Radio
                      key={option.value}
                      value={option.value}
                      label={option.label}
                      description={option.description}
                    />
                  ))}
                </RadioGroup>

                {saveError && <Alert type="danger">{saveError}</Alert>}

                <Row justifyContent="flex-end" gap={spacing.md}>
                  <Button
                    size="medium"
                    variant="contained"
                    onClick={handleSave}
                    disabled={saving || !hasUnsavedChanges}
                  >
                    {saving ? 'Saving…' : 'Save changes'}
                  </Button>
                  {hasUnsavedChanges && !saving && (
                    <Button
                      size="medium"
                      variant="outlined"
                      onClick={handleCancel}
                    >
                      Cancel
                    </Button>
                  )}
                </Row>
              </Col>
            </Card>
          </Col>

          {/* Selector-based Overrides section */}
          <Col gap={spacing.md}>
            <Col gap={spacing.xs}>
              <Text variant="heading2">Selector-based Overrides</Text>
              <Text variant="bodySmall" color={color.text.muted}>
                When using the Standard preset, you can control privacy at the
                element level by adding CSS classes to your page.
              </Text>
            </Col>

            <Card>
              <Col padding={spacing.xl} gap={spacing.lg}>
                <Col gap={spacing.sm}>
                  <Text variant="label" as="span" color={color.text.label}>
                    .repro-ignore
                  </Text>
                  <Text variant="bodySmall" color={color.text.secondary}>
                    Add{' '}
                    <Inline
                      component="code"
                      {...textStyles.code}
                      backgroundColor={color.bg.muted}
                      borderRadius={radius.sm}
                      padding={`1px ${spacing.xs}px`}
                    >
                      .repro-ignore
                    </Inline>{' '}
                    to any element to exclude it from recording. The element and
                    its children will not appear in the recorded session.
                  </Text>
                </Col>
                <Col gap={spacing.sm}>
                  <Text variant="label" as="span" color={color.text.label}>
                    .repro-mask
                  </Text>
                  <Text variant="bodySmall" color={color.text.secondary}>
                    Add{' '}
                    <Inline
                      component="code"
                      {...textStyles.code}
                      backgroundColor={color.bg.muted}
                      borderRadius={radius.sm}
                      padding={`1px ${spacing.xs}px`}
                    >
                      .repro-mask
                    </Inline>{' '}
                    to any element to mask its contents. The element&apos;s
                    structure is preserved but text content is replaced with{' '}
                    <Inline
                      component="code"
                      {...textStyles.code}
                      backgroundColor={color.bg.muted}
                      borderRadius={radius.sm}
                      padding={`1px ${spacing.xs}px`}
                    >
                      [MASKED]
                    </Inline>
                    .
                  </Text>
                  <Alert type="info">
                    <Inline
                      component="code"
                      {...textStyles.code}
                      backgroundColor={color.bg.muted}
                      borderRadius={radius.sm}
                      padding={`1px ${spacing.xs}px`}
                    >
                      .repro-mask
                    </Inline>{' '}
                    support is planned but not yet active. The Strict preset
                    uses an alternative masking approach that covers all input
                    elements and images by default.
                  </Alert>
                </Col>
              </Col>
            </Card>
          </Col>
        </Stack>
      </PageFrame.Body>
    </PageFrame>
  )
}

export function RecordingPrivacySettingsRouteConnected() {
  const session = useSession()
  const sessionLoading = useSessionLoading()

  if (sessionLoading) {
    return <FullPageLoading />
  }

  if (!(session != null && 'admin' in session && session.admin === true)) {
    return <Navigate replace to="/settings/profile" />
  }

  return <RecordingPrivacySettingsRoute />
}

export default RecordingPrivacySettingsRouteConnected
