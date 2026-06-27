import React from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import AccountSettingsRouteConnected from '~/routes/AccountSettingsRoute/AccountSettingsRoute'
import ApiKeysRoute from '~/routes/ApiKeysRoute'
import BillingSettingsRouteConnected from '~/routes/BillingSettingsRoute'
import ProfileSettingsRouteConnected from '~/routes/ProfileSettingsRoute'
import RecordingPrivacySettingsRouteConnected from '~/routes/RecordingPrivacySettingsRoute/RecordingPrivacySettingsRoute'

const SettingsRoute: React.FC = () => (
  <Routes>
    {/* Default redirect to profile */}
    <Route index element={<Navigate to="profile" replace />} />
    <Route path="profile" element={<ProfileSettingsRouteConnected />} />
    <Route path="account" element={<AccountSettingsRouteConnected />} />
    <Route path="api-keys" element={<ApiKeysRoute />} />
    <Route
      path="privacy-controls"
      element={<RecordingPrivacySettingsRouteConnected />}
    />
    <Route path="billing" element={<BillingSettingsRouteConnected />} />
  </Routes>
)

export default SettingsRoute
