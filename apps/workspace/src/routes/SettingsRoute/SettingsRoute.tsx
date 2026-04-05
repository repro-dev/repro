import { Col } from '@jsxstyle/react'
import { PageFrame, spacing } from '@repro/design'
import React from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'

const ProfilePage: React.FC = () => (
  <PageFrame>
    <PageFrame.Header>
      <PageFrame.Title>Profile</PageFrame.Title>
    </PageFrame.Header>
    <PageFrame.Body maxWidth={720}>
      <Col gap={spacing['2xl']} />
    </PageFrame.Body>
  </PageFrame>
)

const AccountPage: React.FC = () => (
  <PageFrame>
    <PageFrame.Header>
      <PageFrame.Title>Account</PageFrame.Title>
    </PageFrame.Header>
    <PageFrame.Body maxWidth={720}>
      <Col gap={spacing['2xl']} />
    </PageFrame.Body>
  </PageFrame>
)

const TeamPage: React.FC = () => (
  <PageFrame>
    <PageFrame.Header>
      <PageFrame.Title>Team</PageFrame.Title>
    </PageFrame.Header>
    <PageFrame.Body maxWidth={720}>
      <Col gap={spacing['2xl']} />
    </PageFrame.Body>
  </PageFrame>
)

const BillingPage: React.FC = () => (
  <PageFrame>
    <PageFrame.Header>
      <PageFrame.Title>Billing</PageFrame.Title>
    </PageFrame.Header>
    <PageFrame.Body maxWidth={720}>
      <Col gap={spacing['2xl']} />
    </PageFrame.Body>
  </PageFrame>
)

const ApiKeysPage: React.FC = () => (
  <PageFrame>
    <PageFrame.Header>
      <PageFrame.Title>API Keys</PageFrame.Title>
    </PageFrame.Header>
    <PageFrame.Body maxWidth={720}>
      <Col gap={spacing['2xl']} />
    </PageFrame.Body>
  </PageFrame>
)

const SettingsRoute: React.FC = () => (
  <Routes>
    {/* Default redirect to profile */}
    <Route index element={<Navigate to="profile" replace />} />
    <Route path="profile" element={<ProfilePage />} />
    <Route path="account" element={<AccountPage />} />
    <Route path="api-keys" element={<ApiKeysPage />} />
    <Route path="team" element={<TeamPage />} />
    <Route path="billing" element={<BillingPage />} />
  </Routes>
)

export default SettingsRoute
