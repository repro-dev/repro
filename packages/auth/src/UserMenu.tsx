import { Row } from '@jsxstyle/react'
import { Avatar, DropdownMenu, color, spacing } from '@repro/design'
import { logger } from '@repro/logger'
import { done } from 'fluture'
import React from 'react'
import { useLogout, useSession } from './hooks'

export const UserMenu: React.FC = () => {
  const user = useSession()
  const logout = useLogout()

  if (!user) {
    return null
  }

  function handleLogout() {
    logout().pipe(
      done(error => {
        if (error) {
          logger.error(error)
        }
      })
    )
  }

  return (
    <DropdownMenu>
      <DropdownMenu.Trigger>
        <Row
          component="button"
          type="button"
          width="100%"
          alignItems="center"
          gap={spacing.md}
          padding={spacing.lg}
          cursor="pointer"
          border="none"
          background="none"
          hoverBackgroundColor={color.bg.hover}
          props={{ 'aria-label': `Open user menu for ${user.name}` }}
        >
          <Avatar name={user.name} size={24} />
        </Row>
      </DropdownMenu.Trigger>
      <DropdownMenu.Content side="top" align="start">
        <DropdownMenu.Item onSelect={handleLogout}>Sign out</DropdownMenu.Item>
      </DropdownMenu.Content>
    </DropdownMenu>
  )
}
