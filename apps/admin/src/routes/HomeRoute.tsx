import React from 'react'
import { Navigate } from 'react-router-dom'

export const HomeRoute: React.FC = () => {
  return <Navigate to="/recordings" replace />
}
