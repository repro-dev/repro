import { Avatar } from '@repro/design'
import React from 'react'
import { useSession } from './hooks'

export const MyAvatar: React.FC = () => {
  const user = useSession()

  if (user == null) {
    return null
  }

  return <Avatar name={user.name} />
}
