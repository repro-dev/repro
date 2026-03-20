import { StarIcon } from 'lucide-react'
import React, { PropsWithChildren } from 'react'
import { Label as CatalystLabel } from '~/catalyst/fieldset'
import { useFormFieldContext } from '../FormField/FormFieldContext'
import type { SizeVariant } from '../types'

export interface LabelProps {
  icon?: React.ReactNode
  required?: boolean
  htmlFor?: string
  size?: SizeVariant
}

export const Label: React.FC<PropsWithChildren<LabelProps>> = ({
  children,
  icon,
  required: requiredProp,
  htmlFor: htmlForProp,
}) => {
  const ctx = useFormFieldContext()
  const htmlFor = htmlForProp ?? ctx?.id
  const required = requiredProp ?? ctx?.required ?? false

  return (
    <CatalystLabel htmlFor={htmlFor}>
      <span className="flex items-center justify-between w-full">
        <span className="flex items-center gap-1">
          {icon}
          {children}
        </span>
        {required && (
          <span className="flex items-center gap-1 text-xs font-normal text-zinc-500">
            <StarIcon
              size={10}
              className="text-blue-500 fill-blue-500"
              strokeWidth={0}
            />
            Required
          </span>
        )}
      </span>
    </CatalystLabel>
  )
}
