import { Row } from '@jsxstyle/react'
import { Badge, Logo, spacing } from '@repro/design'
import React from 'react'
import { Link } from 'react-router-dom'

export const AdminHeader: React.FC = () => {
  return (
    <Row
      component={Link}
      alignItems="center"
      gap={spacing.md}
      paddingV={spacing.lg}
      props={{ to: '/', style: { textDecoration: 'none' } }}
    >
      <Logo size={24} />
      <Badge context="danger" size="small">
        Admin
      </Badge>
    </Row>
  )
}
