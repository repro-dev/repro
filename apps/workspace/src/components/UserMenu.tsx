import { Row } from '@jsxstyle/react'
import { useLogout, useSession } from '@repro/auth'
import { Avatar, DropdownMenu, color, spacing } from '@repro/design'
import { logger } from '@repro/logger'
import { done } from 'fluture'
import React from 'react'

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
          alignItems="center"
          gap={spacing.md}
          padding={spacing.lg}
          cursor="pointer"
          hoverBackgroundColor={color.bg.hover}
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
