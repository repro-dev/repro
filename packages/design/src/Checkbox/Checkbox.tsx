import React from 'react'
import {
  Checkbox as CatalystCheckbox,
  CheckboxField,
} from '~/catalyst/checkbox'
import { Description, Label } from '~/catalyst/fieldset'

export interface CheckboxProps {
  label: string
  checked: boolean
  onChange(checked: boolean): void
  size?: 'small' | 'medium' | 'large'
  disabled?: boolean
  description?: string
}

export const Checkbox: React.FC<CheckboxProps> = ({
  label,
  checked,
  onChange,
  disabled = false,
  description,
}) => {
  return (
    <CheckboxField>
      <CatalystCheckbox
        checked={checked}
        disabled={disabled}
        onChange={onChange}
      />
      <Label>{label}</Label>
      {description && <Description>{description}</Description>}
    </CheckboxField>
  )
}

Checkbox.displayName = 'Checkbox'
