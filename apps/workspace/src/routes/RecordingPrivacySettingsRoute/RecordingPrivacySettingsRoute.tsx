import { Block, Col, Inline, Row } from '@jsxstyle/react'
import { useApiClient } from '@repro/api-client'
import { useSession, useSessionLoading } from '@repro/auth'
import {
  Alert,
  Button,
  Card,
  FullPageLoading,
  PageFrame,
  Text,
  color,
  focusRing,
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
import { CheckCircle, Circle } from 'lucide-react'
import React, { useCallback, useState } from 'react'
import { Navigate } from 'react-router-dom'

const desktopViewportQuery = '(min-width: 1024px)'

function useIsDesktopViewport() {
  const [isDesktop, setIsDesktop] = React.useState(() => {
    return (
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia(desktopViewportQuery).matches
    )
  })

  React.useEffect(() => {
    if (
      typeof window === 'undefined' ||
      typeof window.matchMedia !== 'function'
    ) {
      return
    }

    const mediaQueryList = window.matchMedia(desktopViewportQuery)
    const updateMatches = () => setIsDesktop(mediaQueryList.matches)

    updateMatches()

    if (typeof mediaQueryList.addEventListener === 'function') {
      mediaQueryList.addEventListener('change', updateMatches)

      return () => {
        mediaQueryList.removeEventListener('change', updateMatches)
      }
    }

    mediaQueryList.addListener(updateMatches)

    return () => {
      mediaQueryList.removeListener(updateMatches)
    }
  }, [])

  return isDesktop
}

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
      'Masks all input elements and images by default on every recorded page. No page data is captured without explicit opt-in via .rr-ignore.',
  },
  {
    value: 'standard',
    label: 'Standard',
    description:
      'Respects .rr-ignore (exclude element) and .rr-mask (mask contents) CSS classes on recorded pages. Note: .rr-mask is planned but not yet active.',
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

  const isDesktop = useIsDesktopViewport()

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
    (preset: RecordingPrivacyPreset) => {
      setSelectedPreset(preset)
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
        <PageFrame.Body>
          <Block width="100%" maxWidth={1440} margin="0 auto">
            <Alert type="danger">
              Failed to load recording privacy settings. Please refresh the page
              and try again.
            </Alert>
          </Block>
        </PageFrame.Body>
      </PageFrame>
    )
  }

  return (
    <PageFrame>
      <PageFrame.Body>
        <Block width="100%" maxWidth={1440} margin="0 auto">
          <Col gap={spacing.xl} width="100%">
            <Block
              component="header"
              width="100%"
              paddingBottom={spacing.lg}
              borderBottom={`1px solid ${color.border.default}`}
            >
              <Col gap={spacing.sm}>
                <PageFrame.Title>Recording Privacy</PageFrame.Title>
                <Text variant="bodySmall" color={color.text.secondary}>
                  Choose how the workspace handles privacy when recording
                  sessions.
                </Text>
              </Col>
            </Block>

            <Col
              component="section"
              gap={spacing['3xl']}
              width="100%"
              props={{
                style: {
                  maxWidth: isDesktop ? '66.666%' : '100%',
                },
              }}
            >
              {/* Preset selection */}
              <Col gap={spacing.md}>
                <Col gap={spacing.xs}>
                  <Text variant="heading2">Privacy preset</Text>
                  <Text variant="bodySmall" color={color.text.muted}>
                    Select a default privacy level for new recordings. This
                    setting applies workspace-wide.
                  </Text>
                </Col>

                <Col gap={spacing.sm}>
                  {PRESET_OPTIONS.map(option => (
                    <PresetCard
                      key={option.value}
                      info={option}
                      selected={effectivePreset === option.value}
                      onSelect={handleSelect}
                      disabled={saving}
                    />
                  ))}
                </Col>

                {saveError && <Alert type="danger">{saveError}</Alert>}

                <Row gap={spacing.sm} alignItems="center">
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

              {/* Documentation section */}
              <Col gap={spacing.md}>
                <Col gap={spacing.xs}>
                  <Text variant="heading2">About selector-based overrides</Text>
                  <Text variant="bodySmall" color={color.text.muted}>
                    When using the Standard preset, you can control privacy at
                    the element level by adding CSS classes to your page.
                  </Text>
                </Col>

                <Card fullBleed>
                  <Col gap={spacing.lg} padding={spacing.lg}>
                    <Col gap={spacing.sm}>
                      <Text variant="heading3">.rr-ignore</Text>
                      <Text variant="bodySmall" color={color.text.secondary}>
                        Add{' '}
                        <Inline
                          component="code"
                          {...textStyles.code}
                          backgroundColor={color.bg.muted}
                          borderRadius={radius.sm}
                          padding={`1px ${spacing.xs}px`}
                        >
                          .rr-ignore
                        </Inline>{' '}
                        to any element to exclude it from recording. The element
                        and its children will not appear in the recorded
                        session.
                      </Text>
                    </Col>
                    <Col gap={spacing.sm}>
                      <Text variant="heading3">.rr-mask</Text>
                      <Text variant="bodySmall" color={color.text.secondary}>
                        Add{' '}
                        <Inline
                          component="code"
                          {...textStyles.code}
                          backgroundColor={color.bg.muted}
                          borderRadius={radius.sm}
                          padding={`1px ${spacing.xs}px`}
                        >
                          .rr-mask
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
                          .rr-mask
                        </Inline>{' '}
                        support is planned but not yet active. The Strict preset
                        uses an alternative masking approach that covers all
                        input elements and images by default.
                      </Alert>
                    </Col>
                  </Col>
                </Card>
              </Col>
            </Col>
          </Col>
        </Block>
      </PageFrame.Body>
    </PageFrame>
  )
}

interface PresetCardProps {
  info: PresetInfo
  selected: boolean
  disabled?: boolean
  onSelect: (value: RecordingPrivacyPreset) => void
}

function PresetCard({ info, selected, disabled, onSelect }: PresetCardProps) {
  const handleClick = useCallback(() => {
    if (disabled) {
      return
    }
    onSelect(info.value)
  }, [info.value, onSelect, disabled])

  return (
    <Block
      component="button"
      width="100%"
      cursor={disabled ? 'default' : 'pointer'}
      fontFamily="inherit"
      fontSize="inherit"
      lineHeight="inherit"
      textAlign="left"
      border="none"
      padding={0}
      backgroundColor="transparent"
      props={{ type: 'button', onClick: handleClick, disabled }}
      {...focusRing()}
    >
      <Block
        borderWidth={1}
        borderStyle="solid"
        borderColor={selected ? color.primary : color.border.default}
        borderRadius={radius.md}
        backgroundColor={color.bg.surface}
        opacity={disabled ? 0.5 : 1}
        hoverBackgroundColor={disabled ? undefined : color.bg.hover}
      >
        <Row gap={spacing.lg} alignItems="flex-start" padding={spacing.lg}>
          <Block
            flexShrink={0}
            paddingTop={spacing.xs}
            color={selected ? color.primary : color.text.muted}
          >
            {selected ? <CheckCircle size={20} /> : <Circle size={20} />}
          </Block>
          <Col gap={spacing.xs} minWidth={0}>
            <Text variant="label">{info.label}</Text>
            <Text variant="bodySmall" color={color.text.secondary}>
              {info.description}
            </Text>
          </Col>
        </Row>
      </Block>
    </Block>
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
