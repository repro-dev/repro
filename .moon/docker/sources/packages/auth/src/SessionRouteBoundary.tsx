import React from 'react'
import { Outlet } from 'react-router'
import { RequireSession } from './RequireSession'

export const SessionRouteBoundary: React.FC = () => (
  <RequireSession>
    <Outlet />
  </RequireSession>
)
