import { Block, Col, Inline, Row } from '@jsxstyle/react'
import { useApiClient } from '@repro/api-client'
import {
  Button,
  Toggle,
  color,
  fontFamily,
  fontSize,
  fontWeight,
  radius,
  spacing,
  textStyles,
} from '@repro/design'
import { type Cancel, fork } from 'fluture'
import { EyeIcon, XIcon } from 'lucide-react'
import React, { useCallback, useEffect, useRef, useState } from 'react'

export interface PrivacyOverrides {
  maskedSelectors: string[]
  ignoredSelectors: string[]
}

interface PrivacySectionProps {
  onOverridesChange?: (overrides: PrivacyOverrides) => void
}

const SUGGESTIONS: Array<{ label: string; selector: string }> = [
  { label: 'Email inputs', selector: 'input[type="email"]' },
  { label: 'Password fields', selector: 'input[type="password"]' },
  { label: 'Credit card inputs', selector: 'input[autocomplete="cc-number"]' },
  { label: 'Address inputs', selector: 'input[autocomplete="street-address"]' },
  { label: 'Phone inputs', selector: 'input[type="tel"]' },
  { label: 'Date inputs', selector: 'input[type="date"]' },
]

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
              fontSize={fontSize.xs}
            >
              <Block component="span" fontSize={fontSize.xs}>
                {selector}
              </Block>
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
      <Block position="relative">
        <Block
          component="input"
          type="text"
          value={inputValue}
          placeholder={placeholder}
          width="100%"
          boxSizing="border-box"
          paddingH={spacing.sm}
          paddingV={spacing.xs}
          fontSize={fontSize.xs}
          borderRadius={radius.sm}
          border={`1px solid ${color.border.default}`}
          outline="none"
          fontFamily={fontFamily.sans}
          props={{
            onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
              setInputValue((e.target as HTMLInputElement).value)
              setShowSuggestions(
                (e.target as HTMLInputElement).value.length > 0
              )
            },
            onKeyDown: handleKeyDown,
            onFocus: () => setShowSuggestions(inputValue.length > 0),
            onBlur: () => setTimeout(() => setShowSuggestions(false), 200),
          }}
        />

        {showSuggestions && inputValue && (
          <Block
            position="absolute"
            top="100%"
            left={0}
            right={0}
            backgroundColor={color.bg.surface}
            border={`1px solid ${color.border.default}`}
            borderRadius={radius.sm}
            zIndex={10}
            boxShadow="0 2px 8px rgba(0,0,0,0.1)"
          >
            {SUGGESTIONS.filter(
              s =>
                s.selector.includes(inputValue.toLowerCase()) ||
                s.label.toLowerCase().includes(inputValue.toLowerCase())
            ).map(suggestion => (
              <Row
                key={suggestion.selector}
                paddingH={spacing.sm}
                paddingV={spacing.xs}
                cursor="pointer"
                hoverBackgroundColor={color.bg.hover}
                props={{
                  onMouseDown: () => handleSuggestionClick(suggestion.selector),
                }}
              >
                <Col gap={spacing.xs}>
                  <Block component="span" fontSize={fontSize.xs}>
                    {suggestion.selector}
                  </Block>
                  <Block
                    component="span"
                    fontSize={fontSize.xs}
                    color={color.text.secondary}
                  >
                    {suggestion.label}
                  </Block>
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
  }, [apiClient])

  const handleOverridesEnabledChange = useCallback(
    (checked: boolean) => {
      setOverridesEnabled(checked)
      if (!checked) {
        setMaskedSelectors([])
        setIgnoredSelectors([])
        onOverridesChange?.({ maskedSelectors: [], ignoredSelectors: [] })
      }
    },
    [onOverridesChange]
  )

  const handleReset = useCallback(() => {
    setMaskedSelectors([])
    setIgnoredSelectors([])
    setOverridesEnabled(false)
    onOverridesChange?.({ maskedSelectors: [], ignoredSelectors: [] })
  }, [onOverridesChange])

  const handleMaskedChange = useCallback(
    (selectors: string[]) => {
      setMaskedSelectors(selectors)
      onOverridesChange?.({
        maskedSelectors: selectors,
        ignoredSelectors,
      })
    },
    [ignoredSelectors, onOverridesChange]
  )

  const handleIgnoredChange = useCallback(
    (selectors: string[]) => {
      setIgnoredSelectors(selectors)
      onOverridesChange?.({
        maskedSelectors,
        ignoredSelectors: selectors,
      })
    },
    [maskedSelectors, onOverridesChange]
  )

  const handlePreview = useCallback(() => {
    const allSelectors = [...maskedSelectors, ...ignoredSelectors]
    allSelectors.forEach(selector => {
      try {
        const elements = document.querySelectorAll(selector)
        elements.forEach(el => {
          const htmlEl = el as HTMLElement
          const originalOutline = htmlEl.style.outline
          const originalOutlineOffset = htmlEl.style.outlineOffset
          htmlEl.style.outline = '3px solid #f59e0b'
          htmlEl.style.outlineOffset = '2px'
          // Revert after 3 seconds
          setTimeout(() => {
            htmlEl.style.outline = originalOutline
            htmlEl.style.outlineOffset = originalOutlineOffset
          }, 3000)
        })
      } catch {
        // Invalid selector — ignore silently
      }
    })
  }, [maskedSelectors, ignoredSelectors])

  const hasOverrides = maskedSelectors.length > 0 || ignoredSelectors.length > 0

  return (
    <Col gap={spacing.md}>
      {/* Section header */}
      <Row alignItems="center" gap={spacing.sm}>
        <Block component="span" {...textStyles.heading3}>
          Privacy
        </Block>
        {preset && !overridesEnabled && (
          <Block
            component="span"
            fontSize={fontSize.xs}
            paddingH={spacing.sm}
            paddingV={spacing.xs}
            backgroundColor={color.bg.muted}
            borderRadius={radius.sm}
            color={color.text.secondary}
          >
            {PRESET_LABELS[preset]}
          </Block>
        )}
      </Row>

      {/* Workspace default display */}
      <Block
        component="span"
        fontSize={fontSize.xs}
        color={color.text.secondary}
      >
        {presetLoading && 'Loading privacy settings…'}
        {presetError && 'Privacy settings unavailable'}
        {preset && !presetLoading && !presetError && (
          <>
            Workspace default:{' '}
            <Inline fontWeight={fontWeight.semibold}>
              {PRESET_LABELS[preset]}
            </Inline>
            . {PRESET_DESCRIPTIONS[preset]}
          </>
        )}
      </Block>

      {/* Override toggle */}
      <Row alignItems="center" gap={spacing.sm}>
        <Toggle
          checked={overridesEnabled}
          onChange={handleOverridesEnabledChange}
          label="Customize for this recording"
        />
      </Row>

      {/* Override controls */}
      {overridesEnabled && (
        <Col gap={spacing.md} paddingLeft={spacing.sm}>
          <Col gap={spacing.sm}>
            <Block
              component="span"
              fontSize={fontSize.sm}
              fontWeight={fontWeight.semibold}
            >
              Mask content matching...
            </Block>
            <TagInput
              placeholder="Mask content matching (e.g. .my-class)"
              selectors={maskedSelectors}
              onChange={handleMaskedChange}
            />
          </Col>

          <Col gap={spacing.sm}>
            <Block
              component="span"
              fontSize={fontSize.sm}
              fontWeight={fontWeight.semibold}
            >
              Exclude elements matching...
            </Block>
            <TagInput
              placeholder="Exclude elements matching (e.g. .ignore-me)"
              selectors={ignoredSelectors}
              onChange={handleIgnoredChange}
            />
          </Col>

          <Row gap={spacing.sm} alignItems="center">
            <Button
              variant="outlined"
              size="small"
              disabled={!hasOverrides}
              onClick={handlePreview}
            >
              <Row gap={spacing.xs} alignItems="center">
                <EyeIcon size={14} />
                Preview
              </Row>
            </Button>

            <Button
              variant="text"
              size="small"
              disabled={!hasOverrides}
              onClick={handleReset}
            >
              Reset to workspace defaults
            </Button>
          </Row>
        </Col>
      )}
    </Col>
  )
}
