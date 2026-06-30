import { Block, Col, Row } from '@jsxstyle/react'
import { useApiClient } from '@repro/api-client'
import {
  Button,
  FormField,
  Input,
  Label,
  Popover,
  Text,
  Toggle,
  color,
  radius,
  spacing,
} from '@repro/design'
import { type Cancel, fork } from 'fluture'
import { SettingsIcon, XIcon } from 'lucide-react'
import React, { useCallback, useEffect, useRef, useState } from 'react'

export interface PrivacyOverrides {
  maskedSelectors: string[]
  ignoredSelectors: string[]
}

export interface PrivacySectionProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onOverridesChange: (overrides: PrivacyOverrides) => void
}

const SUGGESTIONS: Array<{ label: string; selector: string }> = [
  { label: 'Email inputs', selector: 'input[type="email"]' },
  { label: 'Password fields', selector: 'input[type="password"]' },
  { label: 'Credit card inputs', selector: 'input[autocomplete="cc-number"]' },
  { label: 'Address inputs', selector: 'input[autocomplete="street-address"]' },
  { label: 'Phone inputs', selector: 'input[type="tel"]' },
  { label: 'Date inputs', selector: 'input[type="date"]' },
]

const SUGGESTION_CLOSE_DELAY_MS = 200

type PresetName = 'strict' | 'standard' | 'off'

const PRESET_LABELS: Record<PresetName, string> = {
  strict: 'Strict',
  standard: 'Standard',
  off: 'Off',
}

const PRESET_DESCRIPTIONS: Record<PresetName, string> = {
  strict:
    'All forms, inputs, and text content are masked by default in recordings.',
  standard:
    'Password and credit card fields are masked by default in recordings.',
  off: 'No automatic masking is applied to recordings.',
}

interface TagInputProps {
  placeholder: string
  selectors: string[]
  onChange: (selectors: string[]) => void
}

const TagInput: React.FC<TagInputProps> = ({
  placeholder,
  selectors,
  onChange,
}) => {
  const [inputValue, setInputValue] = useState('')
  const [showSuggestions, setShowSuggestions] = useState(false)

  const matchingSuggestions = SUGGESTIONS.filter(
    s =>
      s.selector.includes(inputValue.toLowerCase()) ||
      s.label.toLowerCase().includes(inputValue.toLowerCase())
  )

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && inputValue.trim()) {
        const trimmed = inputValue.trim()
        if (!selectors.includes(trimmed)) {
          onChange([...selectors, trimmed])
        }
        setInputValue('')
        setShowSuggestions(false)
      } else if (e.key === 'Backspace' && !inputValue && selectors.length > 0) {
        onChange(selectors.slice(0, -1))
      }
    },
    [inputValue, selectors, onChange]
  )

  const handleRemove = useCallback(
    (selector: string) => {
      onChange(selectors.filter(s => s !== selector))
    },
    [selectors, onChange]
  )

  const handleSuggestionClick = useCallback(
    (selector: string) => {
      if (!selectors.includes(selector)) {
        onChange([...selectors, selector])
      }
      setInputValue('')
      setShowSuggestions(false)
    },
    [selectors, onChange]
  )

  const hasSuggestions =
    showSuggestions && inputValue && matchingSuggestions.length > 0

  return (
    <Col gap={spacing.xs}>
      {selectors.length > 0 && (
        <Row gap={spacing.xs} flexWrap="wrap">
          {selectors.map(selector => (
            <Row
              key={selector}
              alignItems="center"
              gap={spacing.xs}
              paddingH={spacing.sm}
              paddingV={spacing.xs}
              backgroundColor={color.bg.muted}
              borderRadius={radius.sm}
            >
              <Text variant="caption" truncate>
                {selector}
              </Text>
              <Row
                component="button"
                cursor="pointer"
                color={color.text.secondary}
                hoverColor={color.text.default}
                props={{
                  onClick: () => handleRemove(selector),
                  type: 'button',
                  'aria-label': `Remove ${selector}`,
                }}
              >
                <XIcon size={12} />
              </Row>
            </Row>
          ))}
        </Row>
      )}
      <Block position="relative" onKeyDown={handleKeyDown}>
        <Input
          size="small"
          value={inputValue}
          placeholder={placeholder}
          aria-label={placeholder}
          onChange={e => {
            setInputValue((e.target as HTMLInputElement).value)
            setShowSuggestions((e.target as HTMLInputElement).value.length > 0)
          }}
          onBlur={() =>
            setTimeout(
              () => setShowSuggestions(false),
              SUGGESTION_CLOSE_DELAY_MS
            )
          }
          onClick={() => {
            if (inputValue.length > 0) setShowSuggestions(true)
          }}
        />

        {hasSuggestions && (
          <Block
            position="absolute"
            top="100%"
            left={0}
            right={0}
            backgroundColor={color.bg.surface}
            border={`1px solid ${color.border.default}`}
            borderRadius={radius.sm}
            zIndex={20}
          >
            {matchingSuggestions.map(suggestion => (
              <Row
                key={suggestion.selector}
                paddingH={spacing.sm}
                paddingV={spacing.sm}
                cursor="pointer"
                hoverBackgroundColor={color.bg.hover}
                props={{
                  onMouseDown: () => handleSuggestionClick(suggestion.selector),
                }}
              >
                <Col gap={spacing.xs}>
                  <Text variant="caption" color={color.text.default}>
                    {suggestion.label}
                  </Text>
                  <Text variant="caption" color={color.text.secondary}>
                    {suggestion.selector}
                  </Text>
                </Col>
              </Row>
            ))}
          </Block>
        )}
      </Block>
    </Col>
  )
}

export const PrivacySection: React.FC<PrivacySectionProps> = ({
  open,
  onOpenChange,
  onOverridesChange,
}) => {
  const apiClient = useApiClient()
  const fetchCancelRef = useRef<Cancel | null>(null)

  const [preset, setPreset] = useState<PresetName | null>(null)
  const [presetLoading, setPresetLoading] = useState(true)
  const [presetError, setPresetError] = useState(false)
  const [overridesEnabled, setOverridesEnabled] = useState(false)
  const [maskedSelectors, setMaskedSelectors] = useState<string[]>([])
  const [ignoredSelectors, setIgnoredSelectors] = useState<string[]>([])

  useEffect(() => {
    if (!open) return

    setPresetLoading(true)
    setPresetError(false)

    const future = apiClient.fetch('/account/privacy')

    fetchCancelRef.current = fork((_error: Error) => {
      setPresetLoading(false)
      setPresetError(true)
    })((data: unknown) => {
      setPresetLoading(false)
      const d = data as { recordingPrivacyPreset?: PresetName }
      if (d.recordingPrivacyPreset) {
        setPreset(d.recordingPrivacyPreset)
      } else {
        setPresetError(true)
      }
    })(future)

    return () => {
      if (fetchCancelRef.current) {
        fetchCancelRef.current()
        fetchCancelRef.current = null
      }
    }
  }, [open, apiClient])

  const hasOverrides = maskedSelectors.length > 0 || ignoredSelectors.length > 0

  const handleApply = useCallback(() => {
    onOverridesChange({
      maskedSelectors: overridesEnabled ? maskedSelectors : [],
      ignoredSelectors: overridesEnabled ? ignoredSelectors : [],
    })
    onOpenChange(false)
  }, [
    overridesEnabled,
    maskedSelectors,
    ignoredSelectors,
    onOverridesChange,
    onOpenChange,
  ])

  const handleReset = useCallback(() => {
    setMaskedSelectors([])
    setIgnoredSelectors([])
    setOverridesEnabled(false)
  }, [])

  const handleOverridesEnabledChange = useCallback((checked: boolean) => {
    setOverridesEnabled(checked)
    if (!checked) {
      setMaskedSelectors([])
      setIgnoredSelectors([])
    }
  }, [])

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <Popover.Trigger>
        <Row
          alignItems="center"
          gap={spacing.sm}
          paddingH={spacing.lg}
          paddingV={spacing.md}
          // eslint-disable-next-line @repro/oxlint-plugin-design/no-hardcoded-color -- transparent white glass tint over header, no exact token equivalent
          backgroundColor="rgba(255, 255, 255, 0.1)"
          color={color.infoTint}
          hoverBackgroundColor={color.infoFg}
          borderRadius={2}
          transition="all 100ms ease-in-out"
          userSelect="none"
          cursor="pointer"
        >
          <SettingsIcon size={16} />
        </Row>
      </Popover.Trigger>

      <Popover.Content
        aria-label="Recording privacy controls"
        side="bottom"
        align="end"
        style={{ outline: 'none' }}
      >
        <Col gap={spacing.md} minWidth={300}>
          <Text variant="heading3">Recording privacy</Text>

          {presetLoading && (
            <Text variant="caption" color={color.text.secondary}>
              Loading workspace settings…
            </Text>
          )}

          {presetError && (
            <Text variant="caption" color={color.text.secondary}>
              Privacy settings unavailable
            </Text>
          )}

          {preset && !presetLoading && !presetError && (
            <Col gap={spacing.xs}>
              <Text variant="caption" color={color.text.secondary}>
                Workspace default:{' '}
                <Text variant="caption" as="strong" weight="bold">
                  {PRESET_LABELS[preset]}
                </Text>
                . {PRESET_DESCRIPTIONS[preset]}
              </Text>
            </Col>
          )}

          <Row alignItems="center">
            <Toggle
              checked={overridesEnabled}
              onChange={handleOverridesEnabledChange}
              label="Customize for this recording"
            />
          </Row>

          {overridesEnabled && (
            <Col gap={spacing.md}>
              <FormField>
                <Label>Mask content matching…</Label>
                <TagInput
                  placeholder="Mask content matching (e.g. .my-class)"
                  selectors={maskedSelectors}
                  onChange={setMaskedSelectors}
                />
              </FormField>

              <FormField>
                <Label>Exclude elements matching…</Label>
                <TagInput
                  placeholder="Exclude elements matching (e.g. .ignore-me)"
                  selectors={ignoredSelectors}
                  onChange={setIgnoredSelectors}
                />
              </FormField>

              <Button
                variant="text"
                size="small"
                disabled={!hasOverrides}
                onClick={handleReset}
              >
                Reset to defaults
              </Button>
            </Col>
          )}

          <Row justifyContent="flex-end">
            <Button variant="contained" size="small" onClick={handleApply}>
              Apply
            </Button>
          </Row>
        </Col>
        <Popover.Arrow />
      </Popover.Content>
    </Popover>
  )
}
