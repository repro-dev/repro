import React from 'react'
import { Switch as CatalystSwitch, SwitchField } from '~/catalyst/switch'
import { Description, Label } from '~/catalyst/fieldset'

export interface ToggleProps {
  label?: string
  checked: boolean
  size?: 'small' | 'medium' | 'large'
  rounded?: boolean
  disabled?: boolean
  description?: string
  onChange(checked: boolean): void
}

export const Toggle: React.FC<ToggleProps> = ({
  label,
  checked,
  disabled = false,
  description,
  onChange,
}) => {
  if (label) {
    return (
      <SwitchField>
        <Label>{label}</Label>
        {description && <Description>{description}</Description>}
        <CatalystSwitch checked={checked} disabled={disabled} onChange={onChange} />
      </SwitchField>
    )
  }

  return (
    <CatalystSwitch checked={checked} disabled={disabled} onChange={onChange} />
  )
}

Toggle.displayName = 'Toggle'
