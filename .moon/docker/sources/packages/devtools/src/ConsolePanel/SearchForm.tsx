import { Input } from '@repro/design'
import React from 'react'
import { useForm } from 'react-hook-form'

interface Props {
  value: string
  onChange(value: string): void
}

export const SearchForm: React.FC<Props> = ({ value, onChange }) => {
  const { register } = useForm({
    defaultValues: { value },
  })

  return (
    <Input
      size="small"
      placeholder="Enter search to filter logs"
      {...register('value', { onChange: evt => onChange(evt.target.value) })}
    />
  )
}
