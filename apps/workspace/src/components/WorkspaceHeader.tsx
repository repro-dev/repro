import { Row } from '@jsxstyle/react'
import { Logo, spacing } from '@repro/design'
import React from 'react'
import { Link } from 'react-router-dom'

export const WorkspaceHeader: React.FC = () => {
  return (
    <Row
      component={Link}
      alignItems="center"
      gap={spacing.md}
      padding={spacing.lg}
      props={{ to: '/', style: { textDecoration: 'none' } }}
    >
      <Logo size={24} />
    </Row>
  )
}
